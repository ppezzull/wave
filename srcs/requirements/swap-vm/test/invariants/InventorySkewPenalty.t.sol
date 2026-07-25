// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { InventorySkew, InventorySkewArgsBuilder } from "../../src/instructions/InventorySkew.sol";
import { OracleGuard } from "../../src/instructions/OracleGuard.sol";
import { XYCSwap } from "../../src/instructions/XYCSwap.sol";

import { Program, ProgramBuilder } from "../utils/ProgramBuilder.sol";
import { MockOracle } from "../mocks/MockOracle.sol";
import { StrategyInvariantBuilders } from "../base/StrategyInvariantBuilders.sol";

/// @notice Smoke coverage for the penalty leg (the invariant battery —
///         liveness, additivity — is a separate milestone-3 task):
///         deviation-increasing flow pays, deviation-reducing flow doesn't,
///         exactOut mirrors with ceilDiv, the reserved improvement leg
///         rejects, and the guard+skew composition holds one-sided.
contract InventorySkewPenaltyTest is StrategyInvariantBuilders {
    using Math for uint256;
    using ProgramBuilder for Program;

    uint64 private constant TARGET_50_50 = 0.5e18;
    uint16 private constant SLOPE_BPS = 100; // 100 bps per 10% deviation
    uint16 private constant MAX_SKEW_BPS = 300;
    uint256 private constant BPS = 10_000;
    uint256 private constant POOL = 100e18;
    uint256 private constant SWAP_AMOUNT = 20e18;

    /// @dev Expected penalty for a lt→gt exactIn fill on a POOL/POOL pool:
    ///      replicate the instruction's own arithmetic from the unpenalized
    ///      inner amounts.
    function _expectedPenaltyBps(uint256 amountIn, uint256 innerOut) private pure returns (uint256) {
        uint256 ltAfter = POOL + amountIn;
        uint256 gtAfter = POOL - innerOut;
        uint256 shareAfter = Math.mulDiv(ltAfter, 1e18, ltAfter + gtAfter);
        uint256 deviationAfter = shareAfter - TARGET_50_50; // lt grows in this direction
        return Math.min((SLOPE_BPS * deviationAfter).ceilDiv(0.1e18), MAX_SKEW_BPS);
    }

    function test_InventorySkew_DeviationIncreasing_ExactIn_PaysPenalty() public {
        ISwapVM.Order memory plain = createStrategy(buildXycProgram());
        shipStrategy(plain, POOL, POOL);
        ISwapVM.Order memory skewed = createStrategy(buildSkewedXycProgram(TARGET_50_50, SLOPE_BPS, MAX_SKEW_BPS));
        shipStrategy(skewed, POOL, POOL);

        (, uint256 outPlain) = quoteAsTaker(plain, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);
        (, uint256 outSkewed) = swapAsTaker(skewed, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);

        uint256 penaltyBps = _expectedPenaltyBps(SWAP_AMOUNT, outPlain);
        assertGt(penaltyBps, 0, "this fill must increase deviation");
        assertEq(outSkewed, outPlain * (BPS - penaltyBps) / BPS, "penalty applied, floored (maker-favoured)");
        assertLt(outSkewed, outPlain, "deviation-increasing flow pays");
    }

    function test_InventorySkew_DeviationReducing_NoPenalty() public {
        // Inventory starts off-target at 80/120 (shareLt 0.4); buying gt with
        // lt moves it back toward 0.5 — no penalty, amounts equal plain xyc.
        ISwapVM.Order memory plain = createStrategy(buildXycProgram());
        shipStrategy(plain, 80e18, 120e18);
        ISwapVM.Order memory skewed = createStrategy(buildSkewedXycProgram(TARGET_50_50, SLOPE_BPS, MAX_SKEW_BPS));
        shipStrategy(skewed, 80e18, 120e18);

        (, uint256 outPlain) = quoteAsTaker(plain, address(tokenLt), address(tokenGt), 10e18, true);
        (, uint256 outSkewed) = swapAsTaker(skewed, address(tokenLt), address(tokenGt), 10e18, true);

        assertEq(outSkewed, outPlain, "deviation-reducing flow must pass untouched");
    }

    function test_InventorySkew_ExactOut_MirrorsWithCeilDiv() public {
        ISwapVM.Order memory plain = createStrategy(buildXycProgram());
        shipStrategy(plain, POOL, POOL);
        ISwapVM.Order memory skewed = createStrategy(buildSkewedXycProgram(TARGET_50_50, SLOPE_BPS, MAX_SKEW_BPS));
        shipStrategy(skewed, POOL, POOL);

        uint256 wantOut = 10e18;
        (uint256 inPlain,) = quoteAsTaker(plain, address(tokenLt), address(tokenGt), wantOut, false);
        (uint256 inSkewed, uint256 outSkewed) = swapAsTaker(skewed, address(tokenLt), address(tokenGt), wantOut, false);

        assertEq(outSkewed, wantOut, "exactOut delivered");
        // Post-trade deviation is computed from the unpenalized inner amounts.
        uint256 ltAfter = POOL + inPlain;
        uint256 gtAfter = POOL - wantOut;
        uint256 deviationAfter = Math.mulDiv(ltAfter, 1e18, ltAfter + gtAfter) - TARGET_50_50;
        uint256 penaltyBps = Math.min((SLOPE_BPS * deviationAfter).ceilDiv(0.1e18), MAX_SKEW_BPS);
        assertEq(inSkewed, (inPlain * BPS).ceilDiv(BPS - penaltyBps), "exactOut penalty ceils amountIn");
        assertGt(inSkewed, inPlain, "taker pays more input under penalty");
    }

    function test_InventorySkew_PenaltyCappedAtMaxSkew() public {
        // Steep slope forces the cap to bind.
        ISwapVM.Order memory plain = createStrategy(buildXycProgram());
        shipStrategy(plain, POOL, POOL);
        ISwapVM.Order memory skewed = createStrategy(buildSkewedXycProgram(TARGET_50_50, 5000, MAX_SKEW_BPS));
        shipStrategy(skewed, POOL, POOL);

        (, uint256 outPlain) = quoteAsTaker(plain, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);
        (, uint256 outSkewed) = swapAsTaker(skewed, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);

        assertEq(outSkewed, outPlain * (BPS - MAX_SKEW_BPS) / BPS, "penalty must cap at maxSkewBps");
    }

    function test_InventorySkew_ReservedImproveLeg_Rejected() public {
        // Hand-encoded args with maxImproveBps != 0: the improvement leg is
        // CUT (decision record in InventorySkew.sol) and its slot reserved.
        Program memory p = program();
        bytes memory rawArgs = abi.encodePacked(TARGET_50_50, SLOPE_BPS, MAX_SKEW_BPS, uint16(5));
        bytes memory prog = bytes.concat(p.build(InventorySkew._inventorySkew2D, rawArgs), p.build(XYCSwap._xycSwapXD));
        ISwapVM.Order memory order = createStrategy(prog);
        shipStrategy(order, POOL, POOL);

        vm.prank(taker);
        vm.expectRevert(
            abi.encodeWithSelector(InventorySkewArgsBuilder.InventorySkewImproveLegReserved.selector, uint16(5))
        );
        router.swap(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, buildTakerData(true));
    }

    function test_Composition_GuardOuter_SkewInner_OneSidedHolds() public {
        // The design premise behind the one-sided band: the skew penalty
        // moves price in the MAKER's favour, so a guard wrapped OUTSIDE the
        // skew must not trip on it (PR #13 / PLAYBOOK §1.5).
        vm.warp(1_800_000_000);
        MockOracle oracle = new MockOracle(8, 1e8, block.timestamp);

        Program memory p = program();
        bytes memory prog = bytes.concat(
            p.build(OracleGuard._oracleGuard2D, buildGuardArgs(address(oracle), 7200, 150, 0)),
            p.build(
                InventorySkew._inventorySkew2D, InventorySkewArgsBuilder.build(TARGET_50_50, SLOPE_BPS, MAX_SKEW_BPS, 0)
            ),
            p.build(XYCSwap._xycSwapXD)
        );
        ISwapVM.Order memory guardedSkewed = createStrategy(prog);
        shipStrategy(guardedSkewed, POOL, POOL);
        ISwapVM.Order memory skewedOnly = createStrategy(buildSkewedXycProgram(TARGET_50_50, SLOPE_BPS, MAX_SKEW_BPS));
        shipStrategy(skewedOnly, POOL, POOL);

        (, uint256 outSkewedOnly) = quoteAsTaker(skewedOnly, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);
        (uint256 amountIn, uint256 amountOut) =
            swapAsTaker(guardedSkewed, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);

        assertEq(amountIn, SWAP_AMOUNT, "swap settled through the composed program");
        assertEq(amountOut, outSkewedOnly, "guard must not trip on the maker-favoured skew penalty");
    }
}
