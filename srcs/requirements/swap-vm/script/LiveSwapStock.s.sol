// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Script } from "forge-std/Script.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ISwapVM } from "../src/interfaces/ISwapVM.sol";
import { EnsStrategyRouter } from "../src/routers/EnsStrategyRouter.sol";
import { StrategyOpcodes } from "../src/opcodes/StrategyOpcodes.sol";
import { Fee, FeeArgsBuilder } from "../src/instructions/Fee.sol";
import { XYCSwap } from "../src/instructions/XYCSwap.sol";
import { Controls } from "../src/instructions/Controls.sol";
import { MakerTraitsLib } from "../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../src/libs/TakerTraits.sol";

import { Program, ProgramBuilder } from "../test/utils/ProgramBuilder.sol";

// solhint-disable no-console
import { console2 } from "forge-std/console2.sol";

/// @title LiveSwapStock
/// @notice The milestone-1 proof: a real swap through self-deployed Aqua on a
///         STOCK program (flat fee wrapping `_xycSwapXD` — NO balance
///         instruction, Aqua manages balances in Aqua mode).
/// @dev Sequence: maker approves Aqua → `aqua.ship()` (`useAquaInsteadOfSignature`)
///      → `quote()` → `swap()` from a plain-EOA taker (`useTransferFromAndAquaPush`,
///      no callbacks) → balance asserts (both transfers + custody-in-maker-wallet)
///      → `quote == swap` consistency.
///
///      Env: AQUA_ADDRESS, ROUTER_ADDRESS, MAKER_PRIVATE_KEY, TAKER_PRIVATE_KEY;
///      optional TOKEN_A/TOKEN_B (fresh mocks minted when unset), STRATEGY_SALT.
///
///      Inherits StrategyOpcodes ONLY to resolve opcode indices by function
///      pointer (never hand-counted); the table is never executed here, so the
///      zero Aqua ctor arg is inert.
contract LiveSwapStock is Script, StrategyOpcodes {
    using ProgramBuilder for Program;

    uint256 private constant MAKER_LIQUIDITY_A = 100e18;
    uint256 private constant MAKER_LIQUIDITY_B = 100e18;
    uint256 private constant TAKER_SWAP_AMOUNT = 10e18;
    uint32 private constant FLAT_FEE = 0.003e9; // 0.3%, base 1e9 (Fee.sol BPS)

    constructor() StrategyOpcodes(address(0)) { }

    function run() external {
        Aqua aqua = Aqua(vm.envAddress("AQUA_ADDRESS"));
        address router = vm.envAddress("ROUTER_ADDRESS");
        uint256 makerPk = vm.envUint("MAKER_PRIVATE_KEY");
        uint256 takerPk = vm.envUint("TAKER_PRIVATE_KEY");
        address maker = vm.addr(makerPk);
        address taker = vm.addr(takerPk);

        // ── tokens (fresh mocks unless provided) ────────────────────────
        TokenMock tokenA;
        TokenMock tokenB;
        vm.startBroadcast(makerPk);
        if (vm.envOr("TOKEN_A", address(0)) == address(0)) {
            tokenA = new TokenMock("Wave Token A", "WAVA");
            tokenB = new TokenMock("Wave Token B", "WAVB");
            tokenA.mint(maker, MAKER_LIQUIDITY_A);
            tokenB.mint(maker, MAKER_LIQUIDITY_B);
            tokenA.mint(taker, TAKER_SWAP_AMOUNT);
        } else {
            tokenA = TokenMock(vm.envAddress("TOKEN_A"));
            tokenB = TokenMock(vm.envAddress("TOKEN_B"));
        }
        if (taker.balance == 0) {
            payable(taker).transfer(0.02 ether); // gas for the taker EOA
        }
        vm.stopBroadcast();

        // ── the stock program: flat fee wraps the xyc core; salt for
        //    order-hash uniqueness across re-runs ─────────────────────────
        Program memory p = ProgramBuilder.init(_opcodes());
        bytes memory program = bytes.concat(
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FLAT_FEE)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint64(vm.envOr("STRATEGY_SALT", uint256(1)))))
        );

        ISwapVM.Order memory order = MakerTraitsLib.build(
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
                program: program
            })
        );

        // ── ship: maker approves Aqua, registers virtual balances.
        //    No tokens move — custody stays in the maker wallet. ──────────
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = MAKER_LIQUIDITY_A;
        amounts[1] = MAKER_LIQUIDITY_B;

        // ── announce BEFORE ship. Not a style choice: the subgraph's
        //    handlePushed/handleSwapped both do `Strategy.load(); if null return`
        //    (F2 — no phantom rows), so an announce that arrives AFTER the ship
        //    leaves the Pushed already dropped and committedCapital stuck at 0
        //    forever — no returnPct, no ranking, policy R1 can never fire. It is
        //    not recoverable by re-announcing or re-indexing: chronologically the
        //    ship still comes first. (The router's own "post-ship hook" natspec
        //    predates the subgraph and is misleading on this point.)
        //    onlyOwner → broadcast with the announcer key, which is the maker key
        //    in this setup (see root .env / ENS-PATH.md).
        bytes32 ensNode = vm.envOr("ENS_NODE", bytes32(0));
        vm.startBroadcast(makerPk);
        EnsStrategyRouter(payable(router)).announceStrategy(order, ensNode);
        vm.stopBroadcast();
        console2.log("Strategy announced (StrategyDeployed emitted with the real programHash)");

        vm.startBroadcast(makerPk);
        tokenA.approve(address(aqua), type(uint256).max);
        tokenB.approve(address(aqua), type(uint256).max);
        bytes32 strategyHash = aqua.ship(router, abi.encode(order), tokens, amounts);
        vm.stopBroadcast();
        console2.log("Strategy shipped, hash:");
        console2.logBytes32(strategyHash);

        // ── identical takerData for quote and swap (F2.5) ───────────────
        bytes memory takerData = TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: true,
                shouldUnwrapWeth: false,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true, // plain EOA: router pulls + pushes to Aqua
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

        (uint256 quoteIn, uint256 quoteOut,) =
            ISwapVM(router).quote(order, address(tokenA), address(tokenB), TAKER_SWAP_AMOUNT, takerData);
        console2.log("quote: amountIn / amountOut", quoteIn, quoteOut);

        uint256 takerABefore = tokenA.balanceOf(taker);
        uint256 takerBBefore = tokenB.balanceOf(taker);
        uint256 makerABefore = tokenA.balanceOf(maker);
        uint256 makerBBefore = tokenB.balanceOf(maker);

        vm.startBroadcast(takerPk);
        tokenA.approve(router, TAKER_SWAP_AMOUNT);
        (uint256 amountIn, uint256 amountOut,) =
            ISwapVM(router).swap(order, address(tokenA), address(tokenB), TAKER_SWAP_AMOUNT, takerData);
        vm.stopBroadcast();
        console2.log("swap:  amountIn / amountOut", amountIn, amountOut);

        // ── the three asserts (F2.6) + quote==swap ──────────────────────
        require(tokenA.balanceOf(taker) == takerABefore - amountIn, "taker did not pay tokenIn");
        require(tokenB.balanceOf(taker) == takerBBefore + amountOut, "taker did not receive tokenOut");
        require(tokenB.balanceOf(maker) == makerBBefore - amountOut, "tokenOut did not leave the MAKER wallet");
        require(tokenA.balanceOf(maker) == makerABefore + amountIn, "maker did not receive tokenIn");
        require(quoteIn == amountIn && quoteOut == amountOut, "quote != swap");

        console2.log("LIVE SWAP OK: both transfers settled, custody in maker wallet, quote == swap");
    }
}
// solhint-enable no-console
