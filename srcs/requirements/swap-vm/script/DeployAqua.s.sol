// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Script } from "forge-std/Script.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

// solhint-disable no-console
import { console2 } from "forge-std/console2.sol";

/// @title DeployAqua
/// @notice Deploys the Aqua protocol on chains where 1inch does not (Sepolia,
///         local anvil) and persists its address into `config/constants.json`
///         so the Makefile router-deploy flow (`Config.readSwapVMRouterParameters`)
///         picks it up.
/// @dev Also fills the chain's `weth` slot with a fresh mock when it is unset
///      (local chains), and records the broadcaster as `owner`. The chain-id
///      slots must already exist in constants.json — `vm.writeJson` replaces
///      values, it does not create keys.
contract DeployAqua is Script {
    function run() external {
        string memory path = string.concat(vm.projectRoot(), "/config/constants.json");
        string memory chainKey = string.concat(".", vm.toString(block.chainid));

        vm.startBroadcast();

        Aqua aqua = new Aqua();

        address weth = vm.parseJsonAddress(vm.readFile(path), string.concat(".weth", chainKey));
        if (weth == address(0)) {
            weth = address(new TokenMock("Wrapped Ether", "WETH"));
            console2.log("WETH mock deployed at: ", weth);
        }

        vm.stopBroadcast();

        vm.writeJson(vm.toString(address(aqua)), path, string.concat(".aqua", chainKey));
        vm.writeJson(vm.toString(weth), path, string.concat(".weth", chainKey));
        vm.writeJson(vm.toString(msg.sender), path, string.concat(".owner", chainKey));

        console2.log("Aqua deployed at: ", address(aqua));
        console2.log("Owner recorded: ", msg.sender);
    }
}
// solhint-enable no-console
