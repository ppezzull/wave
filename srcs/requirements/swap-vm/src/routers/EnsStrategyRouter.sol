// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Context } from "../libs/VM.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { SwapVM } from "../SwapVM.sol";
import { ISwapVM } from "../interfaces/ISwapVM.sol";
import { MakerTraits, MakerTraitsLib } from "../libs/MakerTraits.sol";
import { StrategyOpcodes } from "../opcodes/StrategyOpcodes.sol";

/// @title EnsStrategyRouter
/// @notice wave's Aqua-mode router: SwapVM execution over the Strategy opcode
///         table, plus the strategy-announcement event the wave subgraph and
///         ENS agent consume
/// @dev The `StrategyDeployed` signature is FROZEN (team contract):
///      - `strategyId` and `ensNode` are indexed (subgraph filter keys);
///        `programHash` is not (payload, never filtered on).
///      - `programHash` is keccak256 of the announced program bytes, computed
///        ON-CHAIN from the calldata the announcer passes — the placeholder
///        era is over, but consumers must still tolerate `bytes32(0)` in
///        events emitted before this landed.
contract EnsStrategyRouter is Simulator, SwapVM, StrategyOpcodes {
    using MakerTraitsLib for MakerTraits;

    /// @notice A wave strategy went live: shipped to Aqua and bound to an ENS name
    /// @param strategyId Identifier of the shipped strategy (the order hash)
    /// @param programHash keccak256 of the compiled program bytes
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
    ///      filters) and the ENS agent's hash-verify.
    ///
    ///      Both event payloads are DERIVED from the order — the caller supplies
    ///      no identifier and no hash, so neither can be wrong (issue #36 / C1a).
    ///      - `strategyId = hash(order)`. In Aqua mode `SwapVM.hash` is
    ///        `keccak256(abi.encode(order))`, which is exactly the `strategyHash`
    ///        Aqua derives in `ship()` — so the router, Aqua and the subgraph key
    ///        one strategy under ONE id, by construction rather than by discipline.
    ///      - `programHash = keccak256(order.traits.program(order.data))`, read
    ///        from the same calldata the VM executes. The event can never carry
    ///        the hash of bytes that were never run; the ENS `v0.programhash`
    ///        record verifies against this.
    ///
    ///      `onlyOwner` because the feed derives reputation from these events: an
    ///      open emitter would let anyone inject strategies that never shipped.
    ///      The owner is wave's announcer key, set at construction via `Rescuable`.
    /// @param order The shipped maker order (the same one handed to `aqua.ship`)
    /// @param ensNode ENS namehash of the strategy's subname
    function announceStrategy(ISwapVM.Order calldata order, bytes32 ensNode) external onlyOwner {
        emit StrategyDeployed(hash(order), keccak256(order.traits.program(order.data)), ensNode);
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
