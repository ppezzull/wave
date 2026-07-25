// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { OracleGuard, OracleGuardArgsBuilder } from "../../src/instructions/OracleGuard.sol";

import { MockOracle } from "../mocks/MockOracle.sol";
import { StrategyInvariantBuilders } from "../base/StrategyInvariantBuilders.sol";

/// @notice The halt: a stale feed reverts the swap in BOTH guard modes, and
///         under `quote()` too (runtime static-context enforcement — the
///         guard is `internal` non-view, not `view`).
contract OracleGuardStaleHaltTest is StrategyInvariantBuilders {
    uint16 private constant MAX_STALENESS = 7200;
    uint16 private constant MAX_DEVIATION_BPS = 150;
    uint256 private constant POOL = 100e18;
    uint256 private constant SWAP_AMOUNT = 10e18;

    MockOracle private _oracle;

    function setUp() public override {
        super.setUp();
        vm.warp(1_800_000_000);
        // Price 1.0 (8 decimals), fresh.
        _oracle = new MockOracle(8, 1e8, block.timestamp);
    }

    function _shippedGuardedOrder(uint8 mode) private returns (ISwapVM.Order memory order) {
        order = createStrategy(
            buildGuardedXycProgram(buildGuardArgs(address(_oracle), MAX_STALENESS, MAX_DEVIATION_BPS, mode))
        );
        shipStrategy(order, POOL, POOL);
    }

    function test_OracleGuard_FreshOracle_SwapPasses() public {
        ISwapVM.Order memory order = _shippedGuardedOrder(OracleGuardArgsBuilder.MODE_REVERT);
        (uint256 amountIn, uint256 amountOut) =
            swapAsTaker(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);
        assertEq(amountIn, SWAP_AMOUNT, "exactIn amount consumed");
        assertGt(amountOut, 0, "swap produced output");
    }

    function test_OracleGuard_StaleOracle_RevertMode_Halts() public {
        ISwapVM.Order memory order = _shippedGuardedOrder(OracleGuardArgsBuilder.MODE_REVERT);
        _oracle.setUpdatedAt(block.timestamp - MAX_STALENESS - 1);

        vm.prank(taker);
        vm.expectRevert(
            abi.encodeWithSelector(
                OracleGuard.OracleGuardStaleOraclePrice.selector,
                block.timestamp,
                block.timestamp - MAX_STALENESS - 1,
                MAX_STALENESS
            )
        );
        router.swap(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, buildTakerData(true));
    }

    function test_OracleGuard_StaleOracle_ClampMode_HaltsToo() public {
        // Staleness reverts in BOTH modes — clamp mode never prices a dead feed.
        ISwapVM.Order memory order = _shippedGuardedOrder(OracleGuardArgsBuilder.MODE_CLAMP);
        _oracle.setUpdatedAt(block.timestamp - MAX_STALENESS - 1);

        vm.prank(taker);
        vm.expectRevert(
            abi.encodeWithSelector(
                OracleGuard.OracleGuardStaleOraclePrice.selector,
                block.timestamp,
                block.timestamp - MAX_STALENESS - 1,
                MAX_STALENESS
            )
        );
        router.swap(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, buildTakerData(true));
    }

    function test_OracleGuard_StaleOracle_QuoteHaltsToo() public {
        // quote() runs the same guard code in static context: same halt.
        ISwapVM.Order memory order = _shippedGuardedOrder(OracleGuardArgsBuilder.MODE_REVERT);
        _oracle.setUpdatedAt(block.timestamp - MAX_STALENESS - 1);

        vm.prank(taker);
        vm.expectRevert(
            abi.encodeWithSelector(
                OracleGuard.OracleGuardStaleOraclePrice.selector,
                block.timestamp,
                block.timestamp - MAX_STALENESS - 1,
                MAX_STALENESS
            )
        );
        router.quote(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, buildTakerData(true));
    }

    function test_OracleGuard_StalenessBoundary_ExactlyMaxStaleness_Passes() public {
        ISwapVM.Order memory order = _shippedGuardedOrder(OracleGuardArgsBuilder.MODE_REVERT);
        _oracle.setUpdatedAt(block.timestamp - MAX_STALENESS);

        (, uint256 amountOut) = swapAsTaker(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, true);
        assertGt(amountOut, 0, "boundary-fresh oracle must pass");
    }

    function test_OracleGuard_NonPositiveAnswer_Halts() public {
        ISwapVM.Order memory order = _shippedGuardedOrder(OracleGuardArgsBuilder.MODE_REVERT);
        _oracle.setAnswer(0);

        vm.prank(taker);
        vm.expectRevert(abi.encodeWithSelector(OracleGuard.OracleGuardInvalidOraclePrice.selector, int256(0)));
        router.swap(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, buildTakerData(true));
    }

    function test_OracleGuard_ReservedFlagBit_Rejected() public {
        // Hand-encoded args with the reserved two-sided bit set (bit1): the
        // ArgsBuilder refuses to build them, and parse refuses to run them.
        bytes memory rawArgs =
            abi.encodePacked(address(_oracle), uint8(0), MAX_STALENESS, MAX_DEVIATION_BPS, uint8(0), uint8(0x02));
        ISwapVM.Order memory order = createStrategy(buildGuardedXycProgramRaw(rawArgs));
        shipStrategy(order, POOL, POOL);

        vm.prank(taker);
        vm.expectRevert(abi.encodeWithSelector(OracleGuardArgsBuilder.OracleGuardInvalidFlags.selector, uint8(0x02)));
        router.swap(order, address(tokenLt), address(tokenGt), SWAP_AMOUNT, buildTakerData(true));
    }

    function buildGuardedXycProgramRaw(bytes memory rawArgs) private view returns (bytes memory) {
        return buildGuardedXycProgram(rawArgs);
    }
}
