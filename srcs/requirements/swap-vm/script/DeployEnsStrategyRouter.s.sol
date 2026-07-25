// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Script } from "forge-std/Script.sol";

import { Config } from "./utils/Config.sol";

import { EnsStrategyRouter } from "../src/routers/EnsStrategyRouter.sol";

// solhint-disable no-console
import { console2 } from "forge-std/console2.sol";

contract DeployEnsStrategyRouter is Script {
    using Config for *;

    function run() external {
        (address aquaAddress, address wethAddress, address owner, string memory name, string memory version) =
            vm.readSwapVMRouterParameters();

        vm.startBroadcast();
        EnsStrategyRouter router = new EnsStrategyRouter(aquaAddress, wethAddress, owner, name, version);
        vm.stopBroadcast();

        console2.log("EnsStrategyRouter deployed at: ", address(router));
    }
}
// solhint-enable no-console
