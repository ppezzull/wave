// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Test } from "forge-std/Test.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { EnsStrategyRouter } from "../../src/routers/EnsStrategyRouter.sol";
import { StrategyOpcodes } from "../../src/opcodes/StrategyOpcodes.sol";
import { OracleGuard, OracleGuardArgsBuilder } from "../../src/instructions/OracleGuard.sol";
import { InventorySkew, InventorySkewArgsBuilder } from "../../src/instructions/InventorySkew.sol";
import { XYCSwap } from "../../src/instructions/XYCSwap.sol";
import { Fee, FeeArgsBuilder } from "../../src/instructions/Fee.sol";
import { MakerTraitsLib } from "../../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../../src/libs/TakerTraits.sol";

import { Program, ProgramBuilder } from "../utils/ProgramBuilder.sol";

/// @title StrategyInvariantBuilders
/// @notice Test base for wave's opcode tests: deploys the wave stack
///         (Aqua + EnsStrategyRouter), ships Aqua-mode strategies, and swaps
///         from a plain-EOA taker. Inherits StrategyOpcodes so
///         ProgramBuilder resolves wave opcode indices by function pointer
///         against the SAME table the router runs (never a *Debug table,
///         whose appended debug slots would diverge from production indices).
abstract contract StrategyInvariantBuilders is Test, StrategyOpcodes {
    using ProgramBuilder for Program;

    Aqua public aqua;
    EnsStrategyRouter public router;
    /// @dev Sorted: tokenLt < tokenGt always.
    TokenMock public tokenLt;
    TokenMock public tokenGt;

    address public maker;
    address public taker;

    constructor() StrategyOpcodes(address(0)) { }

    function setUp() public virtual {
        aqua = new Aqua();
        router = new EnsStrategyRouter(address(aqua), address(0), address(this), "Wave", "1");

        TokenMock a = new TokenMock("Token A", "TKA");
        TokenMock b = new TokenMock("Token B", "TKB");
        (tokenLt, tokenGt) = address(a) < address(b) ? (a, b) : (b, a);

        maker = vm.addr(0x1234);
        taker = vm.addr(0x5678);
    }

    // ── program builders ────────────────────────────────────────────────

    function program() internal pure returns (Program memory) {
        return ProgramBuilder.init(_opcodes());
    }

    function buildGuardArgs(
        address oracle,
        uint16 maxStaleness,
        uint16 maxDeviationBps,
        uint8 mode
    )
        internal
        pure
        returns (bytes memory)
    {
        // decimals 0 ⇒ read from oracle; base = lt token.
        return OracleGuardArgsBuilder.build(
            oracle, 0, maxStaleness, maxDeviationBps, mode, OracleGuardArgsBuilder.FLAG_ORACLE_BASE_IS_LT
        );
    }

    function buildGuardedXycProgram(bytes memory guardArgs) internal view returns (bytes memory) {
        Program memory p = program();
        return bytes.concat(p.build(OracleGuard._oracleGuard2D, guardArgs), p.build(XYCSwap._xycSwapXD));
    }

    function buildSkewedXycProgram(
        uint64 targetRatioE18,
        uint16 slopeBps,
        uint16 maxSkewBps
    )
        internal
        view
        returns (bytes memory)
    {
        Program memory p = program();
        return bytes.concat(
            p.build(
                InventorySkew._inventorySkew2D, InventorySkewArgsBuilder.build(targetRatioE18, slopeBps, maxSkewBps, 0)
            ),
            p.build(XYCSwap._xycSwapXD)
        );
    }

    function buildXycProgram() internal view returns (bytes memory) {
        Program memory p = program();
        return p.build(XYCSwap._xycSwapXD);
    }

    // ── strategy lifecycle ──────────────────────────────────────────────

    function createStrategy(bytes memory programBytes) internal view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: maker,
                shouldUnwrapWeth: false,
                useAquaInsteadOfSignature: true,
                allowZeroAmountIn: false,
                receiver: address(0),
                hasPreTransferInHook: false,
                hasPostTransferInHook: false,
                hasPreTransferOutHook: false,
                hasPostTransferOutHook: false,
                preTransferInTarget: address(0),
                preTransferInData: "",
                postTransferInTarget: address(0),
                postTransferInData: "",
                preTransferOutTarget: address(0),
                preTransferOutData: "",
                postTransferOutTarget: address(0),
                postTransferOutData: "",
                program: programBytes
            })
        );
    }

    function shipStrategy(
        ISwapVM.Order memory order,
        uint256 balanceLt,
        uint256 balanceGt
    )
        internal
        returns (bytes32 strategyHash)
    {
        tokenLt.mint(maker, balanceLt);
        tokenGt.mint(maker, balanceGt);

        vm.startPrank(maker);
        tokenLt.approve(address(aqua), type(uint256).max);
        tokenGt.approve(address(aqua), type(uint256).max);

        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenLt);
        tokens[1] = address(tokenGt);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = balanceLt;
        amounts[1] = balanceGt;
        strategyHash = aqua.ship(address(router), abi.encode(order), tokens, amounts);
        vm.stopPrank();
    }

    function buildTakerData(bool isExactIn) internal view returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: isExactIn,
                shouldUnwrapWeth: false,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true,
                threshold: "",
                to: address(0),
                deadline: 0,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }

    /// @dev Quote as the taker (same identity as the swap so quote == swap
    ///      compares like for like).
    function quoteAsTaker(
        ISwapVM.Order memory order,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        bool isExactIn
    )
        internal
        returns (uint256 amountIn, uint256 amountOut)
    {
        vm.prank(taker);
        (amountIn, amountOut,) = router.quote(order, tokenIn, tokenOut, amount, buildTakerData(isExactIn));
    }

    function swapAsTaker(
        ISwapVM.Order memory order,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        bool isExactIn
    )
        internal
        returns (uint256 amountIn, uint256 amountOut)
    {
        TokenMock(tokenIn).mint(taker, type(uint96).max);
        vm.startPrank(taker);
        TokenMock(tokenIn).approve(address(router), type(uint256).max);
        (amountIn, amountOut,) = router.swap(order, tokenIn, tokenOut, amount, buildTakerData(isExactIn));
        vm.stopPrank();
    }
}
