// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Script } from "forge-std/Script.sol";

import { MockOracle } from "../test/mocks/MockOracle.sol";

// solhint-disable no-console
import { console2 } from "forge-std/console2.sol";

/// @title DeployMockOracle
/// @notice Deploys the demo MockAggregatorV3 (riga 25 / PLAYBOOK §1.5
///         dual-oracle decision): the demo drives this oracle for BOTH the
///         happy path and the judge-triggered halt, so demo-time freshness
///         never depends on a live testnet feed. Real Chainlink stays wired
///         in the compiler registry as the quoted production source.
/// @dev Env (defaults = ETH/USD-style, price 1.0):
///      MOCK_ORACLE_DECIMALS (8) · MOCK_ORACLE_ANSWER (1e8).
///      Drive it afterwards with tools/oracle-ctl.sh.
contract DeployMockOracle is Script {
    function run() external {
        uint8 decimals = uint8(vm.envOr("MOCK_ORACLE_DECIMALS", uint256(8)));
        int256 answer = vm.envOr("MOCK_ORACLE_ANSWER", int256(1e8));

        vm.startBroadcast();
        MockOracle oracle = new MockOracle(decimals, answer, block.timestamp);
        vm.stopBroadcast();

        console2.log("MockOracle deployed at: ", address(oracle));
        console2.log("decimals:", decimals);
        console2.log("answer:  ", answer);
    }
}
// solhint-enable no-console
