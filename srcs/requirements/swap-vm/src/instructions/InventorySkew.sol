// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { Calldata } from "@1inch/solidity-utils/contracts/libraries/Calldata.sol";
import { Context, ContextLib } from "../libs/VM.sol";

library InventorySkewArgsBuilder {
    using Calldata for bytes;

    error InventorySkewMissingTargetRatioArg();
    error InventorySkewMissingSlopeArg();
    error InventorySkewMissingMaxSkewArg();
    error InventorySkewMissingMaxImproveArg();
    error InventorySkewTargetRatioAboveOne(uint64 targetRatioE18);
    error InventorySkewPenaltyCapNotBelowOneHundredPercent(uint16 maxSkewBps);
    error InventorySkewImproveLegReserved(uint16 maxImproveBps);

    uint256 internal constant ONE_E18 = 1e18;
    uint256 internal constant BPS = 10_000;

    function build(
        uint64 targetRatioE18,
        uint16 slopeBps,
        uint16 maxSkewBps,
        uint16 maxImproveBps
    )
        internal
        pure
        returns (bytes memory)
    {
        require(targetRatioE18 <= ONE_E18, InventorySkewTargetRatioAboveOne(targetRatioE18));
        require(maxSkewBps < BPS, InventorySkewPenaltyCapNotBelowOneHundredPercent(maxSkewBps));
        require(maxImproveBps == 0, InventorySkewImproveLegReserved(maxImproveBps));
        return abi.encodePacked(targetRatioE18, slopeBps, maxSkewBps, maxImproveBps);
    }

    function parse(bytes calldata args)
        internal
        pure
        returns (uint64 targetRatioE18, uint16 slopeBps, uint16 maxSkewBps)
    {
        targetRatioE18 = uint64(bytes8(args.slice(0, 8, InventorySkewMissingTargetRatioArg.selector)));
        slopeBps = uint16(bytes2(args.slice(8, 10, InventorySkewMissingSlopeArg.selector)));
        maxSkewBps = uint16(bytes2(args.slice(10, 12, InventorySkewMissingMaxSkewArg.selector)));
        uint16 maxImproveBps = uint16(bytes2(args.slice(12, 14, InventorySkewMissingMaxImproveArg.selector)));
        require(targetRatioE18 <= ONE_E18, InventorySkewTargetRatioAboveOne(targetRatioE18));
        require(maxSkewBps < BPS, InventorySkewPenaltyCapNotBelowOneHundredPercent(maxSkewBps));
        require(maxImproveBps == 0, InventorySkewImproveLegReserved(maxImproveBps));
    }
}

/// @title InventorySkew
/// @notice Keeps maker inventory near a target ratio: flow that INCREASES the
///         deviation from target pays a growing penalty (slope per 10% of
///         deviation, hard-capped below 100%). Flow that reduces deviation
///         passes untouched.
/// @dev PENALTY LEG ONLY — decision record (closes the §1.5 "maxImproveBps
///      UNDECIDED" item): the improvement leg is CUT. The playbook's own
///      empirics found `maxImproveBps` redundant (bound in 0% of grid cells;
///      the oracle band is the real constraint) and the cut-floor keeps the
///      penalty path only. Cutting it also retires the two-leg caveat on the
///      one-sided `_oracleGuard2D`: with no taker-favoured improvement, every
///      price move this instruction makes is maker-favoured, which is exactly
///      the premise the one-sided band rests on. The 4th arg slot stays in
///      the byte layout as RESERVED (must be 0) so the leg can ship later
///      without re-freezing the encoding.
///
///      Wrapping instruction (parse → `ctx.runLoop()` → adjust amounts), like
///      `MinRate`. `internal` NON-view — `ctx.runLoop()` is non-view.
///      Native opcode rather than an `_extruction`: Extruction.sol's own
///      header warns takers must validate external targets (non-upgradeable,
///      can break quote/swap consistency) — a first-class instruction removes
///      that trust surface.
contract InventorySkew {
    using Math for uint256;
    using ContextLib for Context;

    error InventorySkewExpectedBeforeSwapAmountsComputed(uint256 amountIn, uint256 amountOut);

    uint256 private constant BPS = 10_000;
    /// @dev Penalty slope base: `slopeBps` per 10% (0.1e18) of deviation.
    uint256 private constant SLOPE_UNIT = 0.1e18;

    /// @param args.targetRatioE18 | 8 bytes (uint64) — target balanceLt/(balanceLt+balanceGt), 1e18-scaled
    /// @param args.slopeBps       | 2 bytes (uint16) — penalty bps per 10% post-trade deviation
    /// @param args.maxSkewBps     | 2 bytes (uint16) — hard cap on the total penalty, < 10_000 (liveness)
    /// @param args.maxImproveBps  | 2 bytes (uint16) — RESERVED, must be 0 (improvement leg cut)
    function _inventorySkew2D(Context memory ctx, bytes calldata args) internal {
        require(
            ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0,
            InventorySkewExpectedBeforeSwapAmountsComputed(ctx.swap.amountIn, ctx.swap.amountOut)
        );
        (uint64 targetRatioE18, uint16 slopeBps, uint16 maxSkewBps) = InventorySkewArgsBuilder.parse(args);

        uint256 balanceInBefore = ctx.swap.balanceIn;
        uint256 balanceOutBefore = ctx.swap.balanceOut;

        // Run the wrapped (inner) program: everything after this instruction.
        ctx.runLoop();
        if (ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0) {
            return;
        }

        uint256 penaltyBps = _penaltyBps(ctx, balanceInBefore, balanceOutBefore, targetRatioE18, slopeBps, maxSkewBps);
        if (penaltyBps == 0) {
            return;
        }

        // Deviation-increasing flow pays the penalty; rounding favours the
        // maker (amountOut floors, amountIn ceils — invariant #5).
        if (ctx.query.isExactIn) {
            ctx.swap.amountOut = ctx.swap.amountOut * (BPS - penaltyBps) / BPS;
        } else {
            ctx.swap.amountIn = (ctx.swap.amountIn * BPS).ceilDiv(BPS - penaltyBps);
        }
    }

    /// @dev Post-trade deviation drives the penalty (subadditivity confirmed
    ///      empirically in §1.5; pre-trade deviation is the documented
    ///      fallback if super-additivity ever appears). Returns 0 when the
    ///      trade does not increase the deviation from target.
    function _penaltyBps(
        Context memory ctx,
        uint256 balanceInBefore,
        uint256 balanceOutBefore,
        uint64 targetRatioE18,
        uint16 slopeBps,
        uint16 maxSkewBps
    )
        private
        pure
        returns (uint256)
    {
        // No balances to reason about (signature-mode order without a balance
        // instruction) or a fill larger than the tracked balance: skip — the
        // settlement layer, not the skew, owns insufficiency.
        if (balanceInBefore + balanceOutBefore == 0 || ctx.swap.amountOut > balanceOutBefore) {
            return 0;
        }

        bool tokenInIsLt = ctx.query.tokenIn < ctx.query.tokenOut;
        (uint256 ltBefore, uint256 gtBefore) =
            tokenInIsLt ? (balanceInBefore, balanceOutBefore) : (balanceOutBefore, balanceInBefore);
        (uint256 ltAfter, uint256 gtAfter) = tokenInIsLt
            ? (balanceInBefore + ctx.swap.amountIn, balanceOutBefore - ctx.swap.amountOut)
            : (balanceOutBefore - ctx.swap.amountOut, balanceInBefore + ctx.swap.amountIn);

        uint256 totalBefore = ltBefore + gtBefore;
        uint256 totalAfter = ltAfter + gtAfter;
        if (totalAfter == 0) {
            return 0;
        }

        uint256 deviationBefore = _deviationE18(ltBefore, totalBefore, targetRatioE18);
        uint256 deviationAfter = _deviationE18(ltAfter, totalAfter, targetRatioE18);
        if (deviationAfter <= deviationBefore) {
            return 0;
        }

        // Penalty rounds UP (maker-favoured) and is hard-capped below 100%.
        uint256 slopePenalty = (slopeBps * deviationAfter).ceilDiv(SLOPE_UNIT);
        return Math.min(slopePenalty, maxSkewBps);
    }

    function _deviationE18(uint256 lt, uint256 total, uint64 targetRatioE18) private pure returns (uint256) {
        uint256 shareE18 = Math.mulDiv(lt, 1e18, total);
        return shareE18 > targetRatioE18 ? shareE18 - targetRatioE18 : uint256(targetRatioE18) - shareE18;
    }
}
