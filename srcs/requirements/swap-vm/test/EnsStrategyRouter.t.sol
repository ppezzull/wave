// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Test } from "forge-std/Test.sol";
import { VmSafe } from "forge-std/Vm.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { EnsStrategyRouter } from "../src/routers/EnsStrategyRouter.sol";
import { ISwapVM } from "../src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "../src/libs/MakerTraits.sol";

/// @title EnsStrategyRouterTest
/// @notice Covers the frozen `StrategyDeployed` announcement surface: the event
///         wave's subgraph and ENS agent consume. The swap path itself is
///         covered by the upstream Aqua suites via the stock opcode table.
contract EnsStrategyRouterTest is Test {
    EnsStrategyRouter private _router;

    address private constant _NOT_OWNER = address(0xBEEF);
    address private constant _MAKER = address(0xA11CE);
    bytes32 private constant _ENS_NODE = keccak256("eth-usdc-guarded.wave.eth");
    /// @dev Any program bytes work — the router hashes whatever the order carries.
    bytes private constant _PROGRAM = hex"1100";

    /// @dev Mirrors the frozen signature: `strategyId` and `ensNode` indexed,
    ///      `programHash` in the data payload.
    event StrategyDeployed(bytes32 indexed strategyId, bytes32 programHash, bytes32 indexed ensNode);

    function setUp() public {
        _router = new EnsStrategyRouter(address(0), address(0), address(this), "Wave", "1");
    }

    /// @dev An Aqua-mode order carrying `_PROGRAM`. Aqua mode matters: it makes
    ///      `SwapVM.hash` equal `keccak256(abi.encode(order))`, the same value
    ///      `Aqua.ship()` derives — the property this whole surface relies on.
    function _order() private pure returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: _MAKER,
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
                program: _PROGRAM
            })
        );
    }

    /// @notice The announcement emits the frozen event with both filter keys indexed
    function test_AnnounceStrategy_EmitsFrozenEvent() public {
        ISwapVM.Order memory order = _order();

        vm.expectEmit(true, true, true, true, address(_router));
        emit StrategyDeployed(_router.hash(order), keccak256(_PROGRAM), _ENS_NODE);

        _router.announceStrategy(order, _ENS_NODE);
    }

    /// @notice Both payloads are DERIVED from the order (issue #36 / C1a): the id
    ///         is the order hash, the program hash is read from the order's own
    ///         program slice — the caller can supply neither.
    function test_AnnounceStrategy_DerivesIdAndProgramHashFromOrder() public {
        ISwapVM.Order memory order = _order();

        vm.recordLogs();
        _router.announceStrategy(order, _ENS_NODE);

        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "expected exactly one log");
        assertEq(logs[0].topics[1], _router.hash(order), "strategyId must be hash(order)");
        assertEq(logs[0].topics[2], _ENS_NODE, "ensNode must be topic 2");
        assertEq(
            abi.decode(logs[0].data, (bytes32)),
            keccak256(_PROGRAM),
            "programHash must be keccak of the order's program slice"
        );
        assertTrue(keccak256(_PROGRAM) != bytes32(0), "sanity: real hash, not the retired placeholder");
    }

    /// @notice In Aqua mode the announced id equals the `strategyHash` Aqua derives
    ///         in `ship()` — one identity across router, Aqua and the subgraph.
    ///         This is what makes the three subgraph handlers key the same row.
    function test_AnnounceStrategy_IdMatchesAquaStrategyHash() public view {
        ISwapVM.Order memory order = _order();
        assertEq(
            _router.hash(order),
            keccak256(abi.encode(order)),
            "Aqua-mode order hash must equal keccak256(abi.encode(order)), Aqua's ship() key"
        );
    }

    /// @notice A non-owner cannot inject strategies into the feed
    function test_AnnounceStrategy_RevertWhen_CallerIsNotOwner() public {
        vm.prank(_NOT_OWNER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _NOT_OWNER));
        _router.announceStrategy(_order(), _ENS_NODE);
    }
}
