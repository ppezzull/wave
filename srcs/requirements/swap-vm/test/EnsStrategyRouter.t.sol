// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Test } from "forge-std/Test.sol";
import { VmSafe } from "forge-std/Vm.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { EnsStrategyRouter } from "../src/routers/EnsStrategyRouter.sol";

/// @title EnsStrategyRouterTest
/// @notice Covers the frozen `StrategyDeployed` announcement surface: the event
///         wave's subgraph and ENS agent consume. The swap path itself is
///         covered by the upstream Aqua suites via the stock opcode table.
contract EnsStrategyRouterTest is Test {
    EnsStrategyRouter private _router;

    address private constant _NOT_OWNER = address(0xBEEF);
    bytes32 private constant _STRATEGY_ID = keccak256("strategy");
    bytes32 private constant _ENS_NODE = keccak256("eth-usdc-guarded.wave.eth");
    /// @dev Any program bytes work — the router hashes whatever it is shown.
    bytes private constant _PROGRAM = hex"1100";

    /// @dev Mirrors the frozen signature: `strategyId` and `ensNode` indexed,
    ///      `programHash` in the data payload.
    event StrategyDeployed(bytes32 indexed strategyId, bytes32 programHash, bytes32 indexed ensNode);

    function setUp() public {
        _router = new EnsStrategyRouter(address(0), address(0), address(this), "Wave", "1");
    }

    /// @notice The announcement emits the frozen event with both filter keys indexed
    function test_AnnounceStrategy_EmitsFrozenEvent() public {
        vm.expectEmit(true, true, true, true, address(_router));
        emit StrategyDeployed(_STRATEGY_ID, keccak256(_PROGRAM), _ENS_NODE);

        _router.announceStrategy(_STRATEGY_ID, _PROGRAM, _ENS_NODE);
    }

    /// @notice `programHash` is keccak256 of the announced program bytes,
    ///         computed on-chain — the placeholder era is over
    function test_AnnounceStrategy_ProgramHashIsOnchainKeccak() public {
        vm.recordLogs();
        _router.announceStrategy(_STRATEGY_ID, _PROGRAM, _ENS_NODE);

        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "expected exactly one log");
        assertEq(logs[0].topics[1], _STRATEGY_ID, "strategyId must be topic 1");
        assertEq(logs[0].topics[2], _ENS_NODE, "ensNode must be topic 2");
        assertEq(
            abi.decode(logs[0].data, (bytes32)), keccak256(_PROGRAM), "programHash must be keccak of the shown bytes"
        );
        assertTrue(keccak256(_PROGRAM) != bytes32(0), "sanity: real hash, not the retired placeholder");
    }

    /// @notice A non-owner cannot inject strategies into the feed
    function test_AnnounceStrategy_RevertWhen_CallerIsNotOwner() public {
        vm.prank(_NOT_OWNER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _NOT_OWNER));
        _router.announceStrategy(_STRATEGY_ID, _PROGRAM, _ENS_NODE);
    }
}
