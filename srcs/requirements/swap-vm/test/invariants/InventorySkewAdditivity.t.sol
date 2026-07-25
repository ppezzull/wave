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

/// @notice ADDITIVITY (subadditive-or-equal, mirroring the fee-indifference
///         suite): splitting a trade may pay AT MOST the single-trade
///         effective penalty — never more. §1.5 empirics: single 20% ≈ 26bps
///         vs split 10+10 ≈ 25bps (slightly subadditive, by design under
///         post-trade deviation; the documented fallback if super-additivity
///         ever appears is switching to pre-trade deviation).
///
///         Effective penalty is measured against a plain-xyc twin walking the
///         same path (single vs sequential split), so curve slippage cancels
///         and only the skew discount remains. The comparison is
///         cross-multiplied — no division:
///           skewSingle/plainSingle ≤ skewSplitTotal/plainSplitTotal
///           ⇔ skewSingle·plainSplitTotal ≤ skewSplitTotal·plainSingle
contract InventorySkewAdditivityTest is StrategyInvariantBuilders {
    using ProgramBuilder for Program;

    uint64 private constant TARGET_50_50 = 0.5e18;
    uint16 private constant SLOPE_BPS = 100;
    uint16 private constant MAX_SKEW_BPS = 9999; // cap must not bind — we test the slope
    uint256 private constant POOL = 100e18;
    /// @dev Covers rounding at the wei scale across the cross-multiplied
    ///      products (amounts ≥ 1e18, so this is ≪ 1 bps).
    uint256 private constant ROUNDING_TOLERANCE_WEI = 2;

    uint64 private _saltCounter = 1;

    function _shipSkewed() private returns (ISwapVM.Order memory order) {
        Program memory p = program();
        bytes memory prog = bytes.concat(
            p.build(
                InventorySkew._inventorySkew2D, InventorySkewArgsBuilder.build(TARGET_50_50, SLOPE_BPS, MAX_SKEW_BPS, 0)
            ),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, ControlsArgsBuilder.buildSalt(_saltCounter++))
        );
        order = createStrategy(prog);
        shipStrategy(order, POOL, POOL);
    }

    function _shipPlain() private returns (ISwapVM.Order memory order) {
        Program memory p = program();
        bytes memory prog = bytes.concat(
            p.build(XYCSwap._xycSwapXD), p.build(Controls._salt, ControlsArgsBuilder.buildSalt(_saltCounter++))
        );
        order = createStrategy(prog);
        shipStrategy(order, POOL, POOL);
    }

    function _assertSubadditiveOrEqual(uint256 size) private {
        // Four isolated strategies: skew/plain × single/split.
        ISwapVM.Order memory skewSingle = _shipSkewed();
        ISwapVM.Order memory skewSplit = _shipSkewed();
        ISwapVM.Order memory plainSingle = _shipPlain();
        ISwapVM.Order memory plainSplit = _shipPlain();

        (, uint256 outSkewSingle) = swapAsTaker(skewSingle, address(tokenLt), address(tokenGt), size, true);
        (, uint256 outPlainSingle) = swapAsTaker(plainSingle, address(tokenLt), address(tokenGt), size, true);

        uint256 half = size / 2;
        (, uint256 skewA) = swapAsTaker(skewSplit, address(tokenLt), address(tokenGt), half, true);
        (, uint256 skewB) = swapAsTaker(skewSplit, address(tokenLt), address(tokenGt), size - half, true);
        (, uint256 plainA) = swapAsTaker(plainSplit, address(tokenLt), address(tokenGt), half, true);
        (, uint256 plainB) = swapAsTaker(plainSplit, address(tokenLt), address(tokenGt), size - half, true);

        uint256 outSkewSplit = skewA + skewB;
        uint256 outPlainSplit = plainA + plainB;

        // Sanity: the penalty is real on this size.
        assertLt(outSkewSingle, outPlainSingle, "single trade must pay a penalty");
        assertLt(outSkewSplit, outPlainSplit, "split trades must pay a penalty");

        // Subadditive-or-equal effective penalty, cross-multiplied.
        assertLe(
            outSkewSingle * outPlainSplit,
            outSkewSplit * outPlainSingle + ROUNDING_TOLERANCE_WEI * outPlainSingle,
            "single-trade effective penalty must be >= split effective penalty"
        );
    }

    function test_InventorySkew_Additivity_SubadditiveOrEqual_Size8() public {
        _assertSubadditiveOrEqual(8e18);
    }

    function test_InventorySkew_Additivity_SubadditiveOrEqual_Size20() public {
        _assertSubadditiveOrEqual(20e18);
    }

    function test_InventorySkew_Additivity_SubadditiveOrEqual_Size40() public {
        _assertSubadditiveOrEqual(40e18);
    }

    function test_InventorySkew_Additivity_SplitNeverProfitsBeyondSlope() public {
        // The split advantage exists (subadditivity) but is bounded: the
        // split total can exceed the single output only by less than the
        // single trade's own penalty (else splitting would fully dodge the
        // skew and the instruction would be decorative).
        ISwapVM.Order memory skewSingle = _shipSkewed();
        ISwapVM.Order memory skewSplit = _shipSkewed();
        ISwapVM.Order memory plain = _shipPlain();

        uint256 size = 20e18;
        (, uint256 outSingle) = swapAsTaker(skewSingle, address(tokenLt), address(tokenGt), size, true);
        (, uint256 outPlain) = swapAsTaker(plain, address(tokenLt), address(tokenGt), size, true);
        (, uint256 a) = swapAsTaker(skewSplit, address(tokenLt), address(tokenGt), size / 2, true);
        (, uint256 b) = swapAsTaker(skewSplit, address(tokenLt), address(tokenGt), size / 2, true);

        assertLe(a + b, outPlain, "split can never beat the penalty-free price");
        assertGe(a + b, outSingle, "split pays at most the single-trade penalty (subadditive)");
    }
}
