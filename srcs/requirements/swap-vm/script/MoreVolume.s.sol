// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Script } from "forge-std/Script.sol";

import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ISwapVM } from "../src/interfaces/ISwapVM.sol";
import { StrategyOpcodes } from "../src/opcodes/StrategyOpcodes.sol";
import { Fee, FeeArgsBuilder } from "../src/instructions/Fee.sol";
import { XYCSwap } from "../src/instructions/XYCSwap.sol";
import { Controls } from "../src/instructions/Controls.sol";
import { MakerTraitsLib } from "../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../src/libs/TakerTraits.sol";

import { Program, ProgramBuilder } from "../test/utils/ProgramBuilder.sol";

// solhint-disable no-console
import { console2 } from "forge-std/console2.sol";

/// @title MoreVolume
/// @notice Drives additional swaps against an ALREADY-SHIPPED strategy so the
///         subgraph accumulates enough `cumulativeVolumeIn` for the retune
///         policy's R1 (`Δvolume / committedCapital >= 0.20`) to fire on REAL
///         data. Without this the monitor reads a live delta and correctly
///         decides `noop` — the loop is provable but never demonstrates a
///         data-caused retune.
/// @dev Rebuilds the SAME order as `LiveSwapStock` (same tokens, same salt) so
///      `hash(order)` — and therefore the subgraph's `Strategy.id` — is
///      unchanged and the volume lands on the seeded row. Deliberately does NOT
///      announce or ship: the strategy is already live, and Aqua rejects
///      re-shipping an existing strategyHash (`StrategiesMustBeImmutable`).
///
///      Env: AQUA_ADDRESS, ROUTER_ADDRESS, TOKEN_A, TOKEN_B, MAKER_PRIVATE_KEY,
///      TAKER_PRIVATE_KEY; optional STRATEGY_SALT (must match the seed run),
///      SWAP_COUNT (default 4), SWAP_AMOUNT (default 10e18).
contract MoreVolume is Script, StrategyOpcodes {
    using ProgramBuilder for Program;

    uint32 private constant FLAT_FEE = 0.003e9; // must match the seeded program

    constructor() StrategyOpcodes(address(0)) { }

    function run() external {
        address router = vm.envAddress("ROUTER_ADDRESS");
        uint256 makerPk = vm.envUint("MAKER_PRIVATE_KEY");
        uint256 takerPk = vm.envUint("TAKER_PRIVATE_KEY");
        address maker = vm.addr(makerPk);
        address taker = vm.addr(takerPk);
        TokenMock tokenA = TokenMock(vm.envAddress("TOKEN_A"));
        TokenMock tokenB = TokenMock(vm.envAddress("TOKEN_B"));
        uint256 count = vm.envOr("SWAP_COUNT", uint256(4));
        uint256 amount = vm.envOr("SWAP_AMOUNT", uint256(10e18));

        // Same program, same salt → same order → same strategyId as the seed.
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
        console2.log("strategyId (must match the seeded row):");
        console2.logBytes32(ISwapVM(router).hash(order));

        bytes memory takerData = TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: true,
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

        // The taker spent its balance on the seed swap; the mock mints freely.
        vm.startBroadcast(makerPk);
        tokenA.mint(taker, amount * count);
        vm.stopBroadcast();

        for (uint256 i = 0; i < count; i++) {
            vm.startBroadcast(takerPk);
            tokenA.approve(router, amount);
            (uint256 amountIn, uint256 amountOut,) =
                ISwapVM(router).swap(order, address(tokenA), address(tokenB), amount, takerData);
            vm.stopBroadcast();
            console2.log("swap", i + 1, amountIn, amountOut);
        }
        console2.log("done - subgraph cumulativeVolumeIn grows by:", amount * count);
    }
}
