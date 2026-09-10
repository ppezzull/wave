// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Script } from "forge-std/Script.sol";

import { StrategyFactory } from "../src/StrategyFactory.sol";

// solhint-disable no-console
import { console2 } from "forge-std/console2.sol";

contract DeployStrategyFactory is Script {
    error AquaAddressDoesNotExist();

    function run() external {
        // Same source of truth as Config.readSwapVMRouterParameters: the
        // factory's only constructor input is the Aqua address.
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/config/constants.json"));
        address aquaAddress = vm.parseJsonAddress(json, string.concat(".aqua.", vm.toString(block.chainid)));
        if (aquaAddress == address(0)) {
            revert AquaAddressDoesNotExist();
        }
        console2.log("Aqua address:", aquaAddress);

        vm.startBroadcast();
        StrategyFactory factory = new StrategyFactory(aquaAddress);
        vm.stopBroadcast();

        console2.log("StrategyFactory deployed at: ", address(factory));
    }
}
// solhint-enable no-console
