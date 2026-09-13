// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Script } from "forge-std/Script.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ISwapVM } from "../src/interfaces/ISwapVM.sol";
import { MakerTraits } from "../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../src/libs/TakerTraits.sol";

// solhint-disable no-console
import { console2 } from "forge-std/console2.sol";

/// @title MainnetForkTake
/// @notice The taker leg of the mainnet-fork E2E: quote (and optionally swap)
///         against a strategy ALREADY shipped to Aqua — no deployment here.
///         Everything (order bytes, tokens, addresses) comes from env, so the
///         same script takes any shipped strategy by replaying its exact program.
/// @dev Env: ROUTER_ADDRESS, MAKER_ADDRESS, TAKER_PRIVATE_KEY, PROGRAM_HEX,
///      TOKEN_IN, TOKEN_OUT, AMOUNT; optional DO_SWAP=1 to broadcast the swap.
///      Taker is a plain EOA: `useTransferFromAndAquaPush` (router pulls tokenIn,
///      pushes tokenOut via Aqua — custody stays in the maker wallet).
///      Asserts (swap mode): amountOut floor, taker pays/receives, maker wallet
///      receives/pays (Aqua move, not custody change), quote == swap.
contract MainnetForkTake is Script {
    function run() external {
        address router = vm.envAddress("ROUTER_ADDRESS");
        address maker = vm.envAddress("MAKER_ADDRESS");
        uint256 takerPk = vm.envUint("TAKER_PRIVATE_KEY");
        address taker = vm.addr(takerPk);
        address tokenIn = vm.envAddress("TOKEN_IN");
        address tokenOut = vm.envAddress("TOKEN_OUT");
        uint256 amount = vm.envUint("AMOUNT");
        bool doSwap = vm.envOr("DO_SWAP", false);

        // The shipped order, byte-for-byte: Aqua mode (traits bit 254), program as data.
        ISwapVM.Order memory order =
            ISwapVM.Order({maker: maker, traits: MakerTraits.wrap(1 << 254), data: vm.envBytes("PROGRAM_HEX")});

        // Identical takerData for quote and swap (quote == swap is the invariant).
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

        vm.startBroadcast(takerPk);

        (uint256 quoteIn, uint256 quoteOut, bytes32 orderHash) =
            ISwapVM(router).quote(order, tokenIn, tokenOut, amount, takerData);
        console2.log("orderHash:");
        console2.logBytes32(orderHash);
        console2.log("quote: amountIn / amountOut", quoteIn, quoteOut);

        if (!doSwap) {
            vm.stopBroadcast();
            console2.log("QUOTE ONLY (DO_SWAP unset)");
            return;
        }

        IERC20(tokenIn).approve(router, amount);
        uint256 takerInBefore = IERC20(tokenIn).balanceOf(taker);
        uint256 takerOutBefore = IERC20(tokenOut).balanceOf(taker);
        uint256 makerInBefore = IERC20(tokenIn).balanceOf(maker);
        uint256 makerOutBefore = IERC20(tokenOut).balanceOf(maker);

        (uint256 amountIn, uint256 amountOut,) =
            ISwapVM(router).swap(order, tokenIn, tokenOut, amount, takerData);
        vm.stopBroadcast();
        console2.log("swap:  amountIn / amountOut", amountIn, amountOut);

        require(amountOut > 0, "amountOut is zero: program priced no output");
        require(IERC20(tokenIn).balanceOf(taker) == takerInBefore - amountIn, "taker did not pay tokenIn");
        require(IERC20(tokenOut).balanceOf(taker) == takerOutBefore + amountOut, "taker did not receive tokenOut");
        require(IERC20(tokenIn).balanceOf(maker) == makerInBefore + amountIn, "maker wallet did not receive tokenIn");
        require(IERC20(tokenOut).balanceOf(maker) == makerOutBefore - amountOut, "tokenOut did not leave the maker wallet");
        require(quoteIn == amountIn && quoteOut == amountOut, "quote != swap");

        console2.log("TAKER SWAP OK: priced output, both transfers settled, custody in maker wallet, quote == swap");
    }
}
// solhint-enable no-console
