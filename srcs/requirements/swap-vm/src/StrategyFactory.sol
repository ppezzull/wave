// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { Context } from "./libs/VM.sol";

import { StrategyOpcodes } from "./opcodes/StrategyOpcodes.sol";

import { Controls, ControlsArgsBuilder } from "./instructions/Controls.sol";
import { Decay, DecayArgsBuilder } from "./instructions/Decay.sol";
import { Fee, FeeArgsBuilder } from "./instructions/Fee.sol";
import { InventorySkew, InventorySkewArgsBuilder } from "./instructions/InventorySkew.sol";
import { OracleGuard, OracleGuardArgsBuilder } from "./instructions/OracleGuard.sol";
import { XYCConcentrate, XYCConcentrateArgsBuilder } from "./instructions/XYCConcentrate.sol";
import { XYCSwap } from "./instructions/XYCSwap.sol";

/// @title StrategyFactory
/// @notice The on-chain twin of the wave compiler: a STRUCTURED spec in, the
///         canonical SwapVM program bytes out — assembled from the same opcode
///         table the EnsStrategyRouter executes, with opcode indices resolved
///         from function pointers (never hand-counted).
/// @dev Two properties hold by construction rather than by runtime check:
///      - **Canonical order is structural.** `StrategySpecInput` lists blocks
///        in the §1.5 canonical order and `build` concatenates in field order,
///        so a non-canonical program is inexpressible through this interface
///        (the TS compiler must instead reject-and-rewrite; see
///        `compiler/src/ir.ts` `assertCanonicalOrder`, its mirror).
///      - **Reserved fields are absent, not validated.** `maxImproveBps` has
///        no struct field (the improvement leg is cut) and the guard's flag
///        bit1 is always 0, so the "reserved must be zero" rules cannot be
///        violated by a caller.
///
///      Cross-language determinism is proven by the frozen fixture triangle:
///        `compiler/test/emit.test.ts` (TS emit) ==
///        `test/StrategyFactory.t.sol` REFERENCE_PROGRAM_HEX (this contract) ==
///        `test/ReferenceProgram.t.sol` (upstream builders).
///      Scaling mirrors `compiler/src/ir.ts` exactly: fees bps→1e9 base
///      (×1e5), targetRatio micro (1e-6 grid)→1e18 (×1e12), concentration
///      price on the 1e-12 grid with floor `Math.sqrt` (`isqrt` in TS), and
///      the oracle decimals fold `feed + base − quote` (the mixed-decimal
///      mispricing fix, enforced identically on both sides).
contract StrategyFactory is StrategyOpcodes {
    /// @notice Concentration band, optional. Prices are token1-per-token0 in
    ///         pair order on the 1e-12 grid (the LLM-facing convention).
    struct Concentration {
        bool enabled;
        uint64 priceMinE12;
        uint64 priceMaxE12;
    }

    /// @notice Chainlink-style oracle guard, optional. Decimals are folded
    ///         on-chain from the pair's ERC-20 decimals — do NOT pre-fold.
    struct OracleGuardInput {
        bool enabled;
        address feed;
        uint8 feedDecimals;
        uint32 maxStalenessSecs;
        uint16 maxDeviationBps;
        uint8 mode; // 0 = revert, 1 = clamp (OracleGuard.MODE_REVERT / MODE_CLAMP)
    }

    /// @notice Inventory skew, optional. `targetRatioMicro` is the LT-token
    ///         share on the 1e-6 grid (0.5 → 500_000).
    struct InventorySkewInput {
        bool enabled;
        uint64 targetRatioMicro;
        uint16 slopeBps;
        uint16 maxSkewBps;
    }

    /// @notice Terminal salt, optional (idempotency / uniqueness knob).
    struct Salt {
        bool enabled;
        uint64 value;
    }

    /// @notice The pricing instruction. specVersion 1 ships exactly one.
    enum CurveKind {
        None, // absent — reverts: without a pricing instruction the shipped
        // strategy is inert (the VM's taker protection reverts every fill)
        Xyc
    }

    /// @notice A wave strategy spec, canonical and bounded. Field order IS the
    ///         canonical block order (§1.5): Deadline → Concentration → Decay →
    ///         OracleGuard → InventorySkew → MakerFee → ProtocolFee → Curve →
    ///         Salt. Blocks are absent when disabled/zero as documented.
    /// @dev The `deadlineAt` is ABSOLUTE unix — the hour-bucket quantization
    ///      that makes re-ships idempotent is a caller policy (compiler
    ///      `cli-emit.ts`), not a chain rule.
    struct StrategySpecInput {
        // ── pair context (drives the oracle fold and the band inversion) ──
        address token0;
        address token1;
        bool baseIsToken0; // oracle base side (ETH for ETH/USD)
        uint8 token0Decimals;
        uint8 token1Decimals;
        // ── blocks, canonical order ──
        bool hasDeadline;
        uint40 deadlineAt; // absolute unix seconds
        Concentration concentration;
        uint32 decayPeriodSecs; // 0 = absent (a 0s decay is meaningless)
        OracleGuardInput oracleGuard;
        InventorySkewInput skew;
        uint32 makerFeeBps; // 0 = absent (a 0 bps fee is a no-op block)
        uint32 protocolFeeBps; // 0 = absent
        address protocolFeeReceiver; // read only when protocolFeeBps > 0
        CurveKind curve; // REQUIRED — CurveKind.None reverts
        Salt salt;
    }

    /// @dev Mirror of the TS compiler's NoPricingInstruction (ir.ts): refuse
    ///      to build a program no instruction prices.
    error NoPricingInstruction();

    /// @dev Mirror of the TS oracle fold's UintOverflow guard: the folded
    ///      decimals byte must land in [0, 255].
    error OracleDecimalsOutOfRange(int256 folded);

    /// @dev Mirror of the TS staleness UintOverflow guard (uintBE(_, 2)).
    error StalenessOutOfRange(uint32 maxStalenessSecs);

    constructor(address aqua) StrategyOpcodes(aqua) { }

    /// @notice Assemble the canonical program for the spec
    /// @param s The structured, canonical spec
    /// @return program SwapVM program bytes: concatenated
    ///         `[opcode:1][argsLength:1][args]` instructions
    function build(StrategySpecInput calldata s) external view returns (bytes memory program) {
        if (s.curve == CurveKind.None) {
            revert NoPricingInstruction();
        }
        // The compiler compares lowercased hex; addresses compare identically.
        bool token0IsLt = s.token0 < s.token1;

        if (s.hasDeadline) {
            program = bytes.concat(program, _op(Controls._deadline, ControlsArgsBuilder.buildDeadline(s.deadlineAt)));
        }
        if (s.concentration.enabled) {
            (uint256 sqrtMinX18, uint256 sqrtMaxX18) = _concentrationBand(s.concentration, token0IsLt);
            program = bytes.concat(
                program,
                _op(
                    XYCConcentrate._xycConcentrateGrowLiquidity2D,
                    XYCConcentrateArgsBuilder.build2D(sqrtMinX18, sqrtMaxX18)
                )
            );
        }
        if (s.decayPeriodSecs != 0) {
            program = bytes.concat(program, _op(Decay._decayXD, DecayArgsBuilder.build(uint16(s.decayPeriodSecs))));
        }
        if (s.oracleGuard.enabled) {
            program = bytes.concat(program, _op(OracleGuard._oracleGuard2D, _oracleGuardArgs(s, token0IsLt)));
        }
        if (s.skew.enabled) {
            // 1e-6 grid → 1e18: micro × 1e12, exactly the TS scaling
            // (round(ratio×1e6)×1e12). Ratio ≤ 1 keeps uint64 in range.
            program = bytes.concat(
                program,
                _op(
                    InventorySkew._inventorySkew2D,
                    InventorySkewArgsBuilder.build(
                        s.skew.targetRatioMicro * 1e12, s.skew.slopeBps, s.skew.maxSkewBps, 0
                    )
                )
            );
        }
        if (s.makerFeeBps != 0) {
            program =
                bytes.concat(program, _op(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(s.makerFeeBps * 1e5)));
        }
        if (s.protocolFeeBps != 0) {
            program = bytes.concat(
                program,
                _op(
                    Fee._aquaProtocolFeeAmountInXD,
                    FeeArgsBuilder.buildProtocolFee(s.protocolFeeBps * 1e5, s.protocolFeeReceiver)
                )
            );
        }
        // CurveKind.Xyc — specVersion 1's only pricing instruction, 0 args.
        program = bytes.concat(program, _op(XYCSwap._xycSwapXD, bytes("")));
        if (s.salt.enabled) {
            program = bytes.concat(program, _op(Controls._salt, ControlsArgsBuilder.buildSalt(s.salt.value)));
        }
    }

    /// @notice keccak256 of program bytes — the programHash the router's
    ///         `StrategyDeployed` event derives from the shipped order
    function hash(bytes calldata program) external pure returns (bytes32) {
        return keccak256(program);
    }

    /// @dev Band inversion mirrors ir.ts `lowerBlock("concentration")`: on the
    ///      gt-per-lt side the band inverts to [1/priceMax, 1/priceMin]. The
    ///      reciprocal is taken on the 1e-12 grid (1e24/priceE12, floor) so
    ///      both sides snap identically; sqrt is floored (`Math.sqrt` == TS
    ///      `isqrt`): sqrt(priceE12 × 1e24) = sqrt(price)·1e18.
    function _concentrationBand(Concentration calldata c, bool token0IsLt) private pure returns (uint256, uint256) {
        uint256 pMinE12 = token0IsLt ? c.priceMinE12 : 1e24 / c.priceMaxE12;
        uint256 pMaxE12 = token0IsLt ? c.priceMaxE12 : 1e24 / c.priceMinE12;
        return (Math.sqrt(pMinE12 * 1e24), Math.sqrt(pMaxE12 * 1e24));
    }

    /// @dev The 27-byte guard: feed(20) + foldedDecimals(1) + staleness(2) +
    ///      deviation(2) + mode(1) + flags(1, baseIsLt on bit0). The decimals
    ///      fold (feed + base − quote) makes answer/10^dec price raw-base in
    ///      raw-quote units — the fix for the mixed-decimal 1e12 mispricing.
    function _oracleGuardArgs(StrategySpecInput calldata s, bool token0IsLt) private pure returns (bytes memory) {
        if (s.oracleGuard.maxStalenessSecs > type(uint16).max) {
            revert StalenessOutOfRange(s.oracleGuard.maxStalenessSecs);
        }
        uint8 baseDecimals = s.baseIsToken0 ? s.token0Decimals : s.token1Decimals;
        uint8 quoteDecimals = s.baseIsToken0 ? s.token1Decimals : s.token0Decimals;
        int256 folded = int256(uint256(s.oracleGuard.feedDecimals)) + int256(uint256(baseDecimals))
            - int256(uint256(quoteDecimals));
        if (folded < 0 || folded > int256(uint256(type(uint8).max))) {
            revert OracleDecimalsOutOfRange(folded);
        }
        // baseIsLt rides the guard's flag bit0 (bit1 reserved, stays 0).
        uint8 flags = (s.baseIsToken0 == token0IsLt) ? 1 : 0;
        return OracleGuardArgsBuilder.build(
            s.oracleGuard.feed,
            uint8(uint256(folded)),
            uint16(s.oracleGuard.maxStalenessSecs),
            s.oracleGuard.maxDeviationBps,
            s.oracleGuard.mode,
            flags
        );
    }

    /// @dev `[opcode:1][argsLength:1][args]` with the opcode resolved by
    ///      scanning the table for the function pointer — the same scheme as
    ///      the upstream `test/utils/ProgramBuilder.sol`, inlined here because
    ///      src/ cannot import from test/. Never hand-count indices.
    function _op(
        function(Context memory, bytes calldata) internal instruction,
        bytes memory args
    )
        private
        pure
        returns (bytes memory)
    {
        function(Context memory, bytes calldata) internal[] memory table = _opcodes();
        for (uint256 i = 0; i < table.length; i++) {
            if (table[i] == instruction) {
                return abi.encodePacked(uint8(i), uint8(args.length), args);
            }
        }
        revert OpcodeNotFound();
    }

    error OpcodeNotFound();
}
