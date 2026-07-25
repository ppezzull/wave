// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { InventorySkew, InventorySkewArgsBuilder } from "../../src/instructions/InventorySkew.sol";
import { XYCSwap } from "../../src/instructions/XYCSwap.sol";
import { Controls, ControlsArgsBuilder } from "../../src/instructions/Controls.sol";

import { Program, ProgramBuilder } from "../utils/ProgramBuilder.sol";
import { StrategyInvariantBuilders } from "../base/StrategyInvariantBuilders.sol";

/// @notice LIVENESS (the missing invariant from the upstream battery): a
///         penalty hard-capped below 100% can never brick the strategy.
///         Whatever the slope, whatever the size, whatever the direction:
///         quote() prices, swap() settles, output stays positive, and the
///         discount never exceeds maxSkewBps. The <100% cap itself is
///         enforced at parse time — a ≥100% cap is unrepresentable.
contract InventorySkewLivenessTest is StrategyInvariantBuilders {
    using ProgramBuilder for Program;

    uint64 private constant TARGET_50_50 = 0.5e18;
    uint16 private constant MAX_CAP = 9999; // highest representable cap
    uint256 private constant BPS = 10_000;
    uint256 private constant POOL = 100e18;

    /// @dev Same skew args → same program → same orderHash; the salt makes
    ///      each grid strategy distinct so shipped balances stay isolated.
    function _shipSkewed(uint16 slopeBps, uint16 maxSkewBps, uint64 salt) private returns (ISwapVM.Order memory order) {
        Program memory p = program();
        bytes memory prog = bytes.concat(
            p.build(
                InventorySkew._inventorySkew2D, InventorySkewArgsBuilder.build(TARGET_50_50, slopeBps, maxSkewBps, 0)
            ),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, ControlsArgsBuilder.buildSalt(salt))
        );
        order = createStrategy(prog);
        shipStrategy(order, POOL, POOL);
    }

    function test_InventorySkew_Liveness_QuoteNeverBricksAcrossSlopeAndSizeGrid() public {
        uint16[3] memory slopes = [uint16(100), 5000, 65_535];
        uint256[3] memory sizes = [uint256(1e18), 10e18, 50e18];
        uint64 salt = 1;

        for (uint256 s = 0; s < slopes.length; s++) {
            ISwapVM.Order memory order = _shipSkewed(slopes[s], MAX_CAP, salt++);
            for (uint256 a = 0; a < sizes.length; a++) {
                // exactIn: prices and stays positive
                (uint256 amountIn, uint256 amountOut) =
                    quoteAsTaker(order, address(tokenLt), address(tokenGt), sizes[a], true);
                assertEq(amountIn, sizes[a], "exactIn consumed");
                assertGt(amountOut, 0, "capped penalty must never zero the output");

                // exactOut: prices and stays finite
                (uint256 inForOut, uint256 outExact) =
                    quoteAsTaker(order, address(tokenLt), address(tokenGt), 1e18, false);
                assertEq(outExact, 1e18, "exactOut delivered");
                assertGt(inForOut, 0, "exactOut input must be positive");
            }
        }
    }

    function test_InventorySkew_Liveness_PenaltyNeverExceedsCap() public {
        // Absurd slope, modest cap: the discount vs plain xyc must stay
        // within maxSkewBps on every size.
        uint16 cap = 300;
        ISwapVM.Order memory plain = createStrategy(buildXycProgram());
        shipStrategy(plain, POOL, POOL);
        ISwapVM.Order memory skewed = _shipSkewed(65_535, cap, 99);

        uint256[3] memory sizes = [uint256(1e18), 10e18, 50e18];
        for (uint256 a = 0; a < sizes.length; a++) {
            (, uint256 outPlain) = quoteAsTaker(plain, address(tokenLt), address(tokenGt), sizes[a], true);
            (, uint256 outSkewed) = quoteAsTaker(skewed, address(tokenLt), address(tokenGt), sizes[a], true);
            assertGe(outSkewed, outPlain * (BPS - cap) / BPS, "discount exceeded maxSkewBps");
            assertLe(outSkewed, outPlain, "skew never pays a bonus (improvement leg is cut)");
        }
    }

    function test_InventorySkew_Liveness_SettlementAtMaxPenalty() public {
        // Not just pricing: a real swap settles at the extreme cap.
        ISwapVM.Order memory order = _shipSkewed(65_535, MAX_CAP, 7);
        (uint256 amountIn, uint256 amountOut) = swapAsTaker(order, address(tokenLt), address(tokenGt), 10e18, true);
        assertEq(amountIn, 10e18, "swap settled");
        assertGt(amountOut, 0, "settled output positive at max penalty");
    }

    function test_InventorySkew_Liveness_FullPenaltyCapUnrepresentable() public {
        // The liveness precondition is enforced where the args are born.
        vm.expectRevert(
            abi.encodeWithSelector(
                InventorySkewArgsBuilder.InventorySkewPenaltyCapNotBelowOneHundredPercent.selector, uint16(10_000)
            )
        );
        this.buildCapForLivenessProbe(10_000);
    }

    /// @dev External wrapper so expectRevert scopes to the builder call.
    function buildCapForLivenessProbe(uint16 cap) external pure returns (bytes memory) {
        return InventorySkewArgsBuilder.build(TARGET_50_50, 100, cap, 0);
    }
}
