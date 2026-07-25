// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { Calldata } from "@1inch/solidity-utils/contracts/libraries/Calldata.sol";
import { Context, ContextLib } from "../libs/VM.sol";
import { IPriceOracle } from "./interfaces/IPriceOracle.sol";

library OracleGuardArgsBuilder {
    using Calldata for bytes;

    error OracleGuardMissingOracleAddressArg();
    error OracleGuardMissingOracleDecimalsArg();
    error OracleGuardMissingMaxStalenessArg();
    error OracleGuardMissingMaxDeviationArg();
    error OracleGuardMissingModeArg();
    error OracleGuardMissingFlagsArg();
    error OracleGuardInvalidMode(uint8 mode);
    error OracleGuardInvalidFlags(uint8 flags);

    uint8 internal constant MODE_REVERT = 0;
    uint8 internal constant MODE_CLAMP = 1;

    /// @dev bit0: the oracle's BASE asset is the pair's lower-address token.
    uint8 internal constant FLAG_ORACLE_BASE_IS_LT = 1 << 0;
    /// @dev bit1: RESERVED for the two-sided band (unimplemented — must be 0).
    ///      Decision record: PR #13 / 10-10-PLAYBOOK.md §1.5 (one-sided band).
    uint8 internal constant FLAGS_RESERVED_MASK = 0xFE;

    function build(
        address oracleAddress,
        uint8 oracleDecimals,
        uint16 maxStaleness,
        uint16 maxDeviationBps,
        uint8 mode,
        uint8 flags
    )
        internal
        pure
        returns (bytes memory)
    {
        require(mode <= MODE_CLAMP, OracleGuardInvalidMode(mode));
        require(flags & FLAGS_RESERVED_MASK == 0, OracleGuardInvalidFlags(flags));
        return abi.encodePacked(oracleAddress, oracleDecimals, maxStaleness, maxDeviationBps, mode, flags);
    }

    function parse(bytes calldata args)
        internal
        pure
        returns (
            address oracleAddress,
            uint8 oracleDecimals,
            uint16 maxStaleness,
            uint16 maxDeviationBps,
            uint8 mode,
            uint8 flags
        )
    {
        oracleAddress = address(bytes20(args.slice(0, 20, OracleGuardMissingOracleAddressArg.selector)));
        oracleDecimals = uint8(bytes1(args.slice(20, 21, OracleGuardMissingOracleDecimalsArg.selector)));
        maxStaleness = uint16(bytes2(args.slice(21, 23, OracleGuardMissingMaxStalenessArg.selector)));
        maxDeviationBps = uint16(bytes2(args.slice(23, 25, OracleGuardMissingMaxDeviationArg.selector)));
        mode = uint8(bytes1(args.slice(25, 26, OracleGuardMissingModeArg.selector)));
        flags = uint8(bytes1(args.slice(26, 27, OracleGuardMissingFlagsArg.selector)));
        require(mode <= MODE_CLAMP, OracleGuardInvalidMode(mode));
        require(flags & FLAGS_RESERVED_MASK == 0, OracleGuardInvalidFlags(flags));
    }
}

/// @title OracleGuard
/// @notice Maker-protection circuit breaker: refuses (mode 0) or clamps
///         (mode 1) fills whose implied price deviates from a Chainlink feed
///         beyond `maxDeviationBps` on the side UNFAVOURABLE to the maker.
///         Staleness ALWAYS reverts, in both modes — that is the halt.
/// @dev The band is ONE-SIDED (decision record: PR #13 / 10-10-PLAYBOOK.md
///      §1.5): the guard is the OUTER wrapper and reads amounts after the
///      `_inventorySkew2D` penalty, which moves price in the maker's favour —
///      a two-sided band would spuriously reject those fills. The two-sided
///      behaviour is a reserved `flags` bit.
///
///      Differs from the in-repo `OraclePriceAdjuster`: that one moves the
///      price toward the oracle in the TAKER's favour; this one refuses
///      maker-unfavourable fills. A pricing mechanism vs a refusal.
///
///      `internal` NON-view like every SwapVM instruction — `ctx.runLoop()`
///      is non-view, so a `view` guard would not compile. Static-safety
///      under `quote()` comes from runtime `isStaticContext` enforcement,
///      not from the keyword (model: `MinRate._requireMinRate1D`).
///
///      Oracle-price convention (the compiler's contract): `answer/10^decimals`
///      prices the BASE token in raw units of the other token. For pairs with
///      differing ERC-20 decimals the compiler folds the decimal gap into the
///      feed it registers; the LLM never sees any of this.
contract OracleGuard {
    using Math for uint256;
    using ContextLib for Context;

    error OracleGuardExpectedBeforeSwapAmountsComputed(uint256 amountIn, uint256 amountOut);
    error OracleGuardStaleOraclePrice(uint256 currentTime, uint256 updatedAt, uint16 maxStaleness);
    error OracleGuardInvalidOraclePrice(int256 answer);
    error OracleGuardPriceDeviationExceeded(
        uint256 amountIn, uint256 amountOut, uint256 oracleNum, uint256 oracleDen, uint16 maxDeviationBps
    );

    uint256 private constant BPS = 10_000;

    /// @param args.oracleAddress   | 20 bytes — Chainlink AggregatorV3
    /// @param args.oracleDecimals  |  1 byte  — 0 ⇒ read from the oracle
    /// @param args.maxStaleness    |  2 bytes — seconds; stale ⇒ ALWAYS revert
    /// @param args.maxDeviationBps |  2 bytes — one-sided band width
    /// @param args.mode            |  1 byte  — 0 revert · 1 clamp to band edge
    /// @param args.flags           |  1 byte  — bit0 oracle base is lt token; rest reserved
    function _oracleGuard2D(Context memory ctx, bytes calldata args) internal {
        require(
            ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0,
            OracleGuardExpectedBeforeSwapAmountsComputed(ctx.swap.amountIn, ctx.swap.amountOut)
        );
        (
            address oracleAddress,
            uint8 oracleDecimals,
            uint16 maxStaleness,
            uint16 maxDeviationBps,
            uint8 mode,
            uint8 flags
        ) = OracleGuardArgsBuilder.parse(args);

        // Staleness is the FIRST branch and reverts in BOTH modes — the
        // guard's whole job is refusing to price against a dead feed.
        IPriceOracle oracle = IPriceOracle(oracleAddress);
        (, int256 answer,, uint256 updatedAt,) = oracle.latestRoundData();
        require(
            block.timestamp <= updatedAt + maxStaleness,
            OracleGuardStaleOraclePrice(block.timestamp, updatedAt, maxStaleness)
        );
        require(answer > 0, OracleGuardInvalidOraclePrice(answer));
        if (oracleDecimals == 0) {
            oracleDecimals = oracle.decimals();
        }

        // Run the wrapped (inner) program: everything after this instruction.
        ctx.runLoop();
        if (ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0) {
            return;
        }

        // Oracle fair price of tokenIn in tokenOut units, as a fraction
        // num/den — comparisons are cross-multiplied, never divided
        // (model: MinRate).
        bool tokenInIsBase =
            (ctx.query.tokenIn < ctx.query.tokenOut) == (flags & OracleGuardArgsBuilder.FLAG_ORACLE_BASE_IS_LT != 0);
        (uint256 num, uint256 den) = tokenInIsBase
            ? (uint256(answer), 10 ** uint256(oracleDecimals))
            : (10 ** uint256(oracleDecimals), uint256(answer));

        // ONE-SIDED: trip only when the maker pays out more than fair + band.
        // amountOut/amountIn > (num/den)·(BPS+dev)/BPS, cross-multiplied:
        if (ctx.swap.amountOut * den * BPS > ctx.swap.amountIn * num * (BPS + maxDeviationBps)) {
            if (mode == OracleGuardArgsBuilder.MODE_REVERT) {
                revert OracleGuardPriceDeviationExceeded(
                    ctx.swap.amountIn, ctx.swap.amountOut, num, den, maxDeviationBps
                );
            }
            // Clamp to the band edge; rounding favours the maker
            // (amountOut floors, amountIn ceils — invariant #5).
            if (ctx.query.isExactIn) {
                ctx.swap.amountOut = ctx.swap.amountIn * num * (BPS + maxDeviationBps) / (den * BPS);
            } else {
                ctx.swap.amountIn = (ctx.swap.amountOut * den * BPS).ceilDiv(num * (BPS + maxDeviationBps));
            }
        }
    }
}
