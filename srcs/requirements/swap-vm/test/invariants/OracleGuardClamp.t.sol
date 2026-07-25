// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { OracleGuard, OracleGuardArgsBuilder } from "../../src/instructions/OracleGuard.sol";

import { MockOracle } from "../mocks/MockOracle.sol";
import { StrategyInvariantBuilders } from "../base/StrategyInvariantBuilders.sol";

/// @notice The one-sided band: in-band fills untouched, maker-unfavourable
///         fills revert (mode 0) or clamp to the band edge with maker-favoured
///         rounding (mode 1), maker-favourable fills NEVER trip, and the
///         clamp kink keeps price monotone (invariant #4).
contract OracleGuardClampTest is StrategyInvariantBuilders {
    using Math for uint256;

    uint16 private constant MAX_STALENESS = 7200;
    uint16 private constant MAX_DEVIATION_BPS = 150;
    uint256 private constant BPS = 10_000;
    uint256 private constant POOL = 100e18;
    uint256 private constant SWAP_AMOUNT = 10e18;
    uint256 private constant ORACLE_ONE = 1e8; // 8-decimals feed

    MockOracle private _oracle;

    function setUp() public override {
        super.setUp();
        vm.warp(1_800_000_000);
        _oracle = new MockOracle(8, int256(ORACLE_ONE), block.timestamp);
    }

    function _shipGuarded(uint8 mode) private returns (ISwapVM.Order memory order) {
        order = createStrategy(
            buildGuardedXycProgram(buildGuardArgs(address(_oracle), MAX_STALENESS, MAX_DEVIATION_BPS, mode))
        );
        shipStrategy(order, POOL, POOL);
    }

    function _shipPlainXyc() private returns (ISwapVM.Order memory order) {
        order = createStrategy(buildXycProgram());
        shipStrategy(order, POOL, POOL);
    }

    /// @dev Band-edge output for the lt→gt direction with base = lt:
    ///      amountOut_edge = amountIn · answer/10^8 · (BPS+dev)/BPS.
    function _edgeOut(uint256 amountIn, uint256 answer) private pure returns (uint256) {
        return amountIn * answer * (BPS + MAX_DEVIATION_BPS) / (1e8 * BPS);
    }

    function test_OracleGuard_InBand_AmountsUntouched() public {
        // Pool price ~0.909 < fair 1.0: maker gives LESS than fair — the
        // guarded amounts must equal the plain-xyc amounts exactly.
        ISwapVM.Order memory guarded = _shipGuarded(OracleGuardArgsBuilder.MODE_REVERT);
        ISwapVM.Order memory plain = _shipPlainXyc();

        (, uint256 outPlain) = quoteAsTaker(plain, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);
        (uint256 inGuarded, uint256 outGuarded) =
            swapAsTaker(guarded, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);

        assertEq(inGuarded, SWAP_AMOUNT, "exactIn consumed");
        assertEq(outGuarded, outPlain, "in-band fill must pass untouched");
    }

    function test_OracleGuard_MakerUnfavourable_RevertMode_Halts() public {
        ISwapVM.Order memory order = _shipGuarded(OracleGuardArgsBuilder.MODE_REVERT);
        // Fair fill at 0.5 would give 5e18 out; the pool pays ~9.09e18 —
        // the maker is overpaying far beyond the band.
        _oracle.setAnswer(0.5e8);

        vm.prank(taker);
        vm.expectRevert(
            abi.encodeWithSelector(
                OracleGuard.OracleGuardPriceDeviationExceeded.selector,
                SWAP_AMOUNT,
                uint256(9_090_909_090_909_090_909),
                uint256(0.5e8),
                uint256(1e8),
                MAX_DEVIATION_BPS
            )
        );
        router.swap(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, buildTakerData(true));
    }

    function test_OracleGuard_MakerUnfavourable_ClampMode_ClampsToBandEdge() public {
        ISwapVM.Order memory order = _shipGuarded(OracleGuardArgsBuilder.MODE_CLAMP);
        _oracle.setAnswer(0.5e8);

        (uint256 amountIn, uint256 amountOut) =
            swapAsTaker(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);

        assertEq(amountIn, SWAP_AMOUNT, "exactIn consumed");
        assertEq(amountOut, _edgeOut(SWAP_AMOUNT, 0.5e8), "clamped exactly to the band edge (floored)");
    }

    function test_OracleGuard_MakerFavourable_OutOfBand_NeverTrips() public {
        // Oracle 2.0: fair out would be ~20e18, pool gives ~9.09e18 — the
        // maker receives a great price. ONE-SIDED: must pass untouched.
        ISwapVM.Order memory guarded = _shipGuarded(OracleGuardArgsBuilder.MODE_REVERT);
        ISwapVM.Order memory plain = _shipPlainXyc();
        _oracle.setAnswer(2e8);

        (, uint256 outPlain) = quoteAsTaker(plain, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);
        (, uint256 outGuarded) = swapAsTaker(guarded, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);

        assertEq(outGuarded, outPlain, "maker-favourable deviation must never trip the one-sided guard");
    }

    function test_OracleGuard_ClampKink_PriceMonotone() public {
        // Put the band edge at 0.95 (answer·1.015 ≈ 0.95): small fills sit
        // above the edge (clamped), large fills below it (untouched). Across
        // the kink, amountOut must stay nondecreasing in amountIn and the
        // effective price nonincreasing — no jump where the clamp engages.
        ISwapVM.Order memory order = _shipGuarded(OracleGuardArgsBuilder.MODE_CLAMP);
        _oracle.setAnswer(int256(uint256(0.95e8 * BPS) / (BPS + MAX_DEVIATION_BPS)));

        uint256 prevOut = 0;
        uint256 prevIn = 0;
        for (uint256 amountIn = 1e18; amountIn <= 10e18; amountIn += 1e18) {
            (, uint256 amountOut) = quoteAsTaker(order, address(tokenLt), address(tokenGt), amountIn, true);
            assertGe(amountOut, prevOut, "amountOut must be nondecreasing across the kink");
            if (prevIn > 0) {
                // price nonincreasing: out/in <= prevOut/prevIn, cross-multiplied
                assertLe(amountOut * prevIn, prevOut * amountIn, "effective price must not jump at the kink");
            }
            prevOut = amountOut;
            prevIn = amountIn;
        }
    }

    function test_OracleGuard_ExactOut_Clamp_RoundsInFavorOfMaker() public {
        ISwapVM.Order memory order = _shipGuarded(OracleGuardArgsBuilder.MODE_CLAMP);
        _oracle.setAnswer(0.5e8);

        uint256 wantOut = 5e18;
        (uint256 amountIn, uint256 amountOut) = swapAsTaker(order, address(tokenLt), address(tokenGt), wantOut, false);

        assertEq(amountOut, wantOut, "exactOut delivered");
        uint256 expectedIn = (wantOut * 1e8 * BPS).ceilDiv(uint256(0.5e8) * (BPS + MAX_DEVIATION_BPS));
        assertEq(amountIn, expectedIn, "clamped amountIn must be the ceiled band-edge input");
        // Maker-favoured: the taker's input covers the edge price fully.
        assertGe(
            amountIn * uint256(0.5e8) * (BPS + MAX_DEVIATION_BPS),
            wantOut * 1e8 * BPS,
            "ceil never undercharges the taker"
        );
    }

    function test_OracleGuard_ClampedPath_QuoteEqualsSwap() public {
        ISwapVM.Order memory order = _shipGuarded(OracleGuardArgsBuilder.MODE_CLAMP);
        _oracle.setAnswer(0.5e8);

        (uint256 qIn, uint256 qOut) = quoteAsTaker(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);
        (uint256 sIn, uint256 sOut) = swapAsTaker(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);

        assertEq(qIn, sIn, "quote amountIn == swap amountIn");
        assertEq(qOut, sOut, "quote amountOut == swap amountOut");
    }
}
