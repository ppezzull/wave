// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Context } from "../libs/VM.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { SwapVM } from "../SwapVM.sol";
import { StrategyOpcodes } from "../opcodes/StrategyOpcodes.sol";

/// @title EnsStrategyRouter
/// @notice wave's Aqua-mode router: SwapVM execution over the Strategy opcode
///         table, plus the strategy-announcement event the wave subgraph and
///         ENS agent consume
/// @dev The `StrategyDeployed` signature is FROZEN (team contract):
///      - `strategyId` and `ensNode` are indexed (subgraph filter keys);
///        `programHash` is not (payload, never filtered on).
///      - `programHash` is emitted as `bytes32(0)` until the compiler's
///        `programHash()` is wired into the ship path; consumers must
///        tolerate the zero value.
contract EnsStrategyRouter is Simulator, SwapVM, StrategyOpcodes {
    /// @notice A wave strategy went live: shipped to Aqua and bound to an ENS name
    /// @param strategyId Identifier of the shipped strategy (the order hash)
    /// @param programHash keccak256 of the compiled program bytes (`bytes32(0)` until wired)
    /// @param ensNode ENS namehash of the strategy's subname
    event StrategyDeployed(bytes32 indexed strategyId, bytes32 programHash, bytes32 indexed ensNode);

    /// @notice Deploy router with Aqua and WETH addresses
    /// @param aqua Address of Aqua protocol for balance management
    /// @param weth Address of WETH token for unwrapping support
    /// @param owner Address of the owner of the router. Only owner can rescue funds.
    /// @param name EIP-712 domain name
    /// @param version EIP-712 domain version
    constructor(
        address aqua,
        address weth,
        address owner,
        string memory name,
        string memory version
    )
        SwapVM(aqua, weth, owner, name, version)
        StrategyOpcodes(aqua)
    { }

    /// @notice Announce a shipped strategy — called right after `aqua.ship()`
    /// @dev Post-ship hook consumed by the subgraph mapping (`strategyId`/`ensNode`
    ///      filters) and the ENS agent's hash-verify
    function announceStrategy(bytes32 strategyId, bytes32 ensNode) external {
        emit StrategyDeployed(strategyId, bytes32(0), ensNode);
    }

    /// @dev Returns instruction set for VM execution
    function _instructions()
        internal
        pure
        override
        returns (function(Context memory, bytes calldata) internal[] memory result)
    {
        return _opcodes();
    }
}
