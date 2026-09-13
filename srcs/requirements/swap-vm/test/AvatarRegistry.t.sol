// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { AvatarRegistry } from "../src/periphery/AvatarRegistry.sol";

contract AvatarRegistryTest is Test {
    AvatarRegistry registry;

    address internal constant ALICE = address(0xA11ce);
    address internal constant BOB = address(0xB0b);

    function setUp() public {
        registry = new AvatarRegistry();
    }

    function testSetAvatarIncrementsPerUserNonce() public {
        assertEq(registry.nonceOf(ALICE), 0, "fresh registry has zero nonce");
        registry.setAvatar(ALICE, "QmYwAPJzv5CZsnAzt8auVTLRLqJcA2xqQ");
        registry.setAvatar(ALICE, "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
        registry.setAvatar(BOB, "QmYwAPJzv5CZsnAzt8auVTLRLqJcA2xqQ");
        assertEq(registry.nonceOf(ALICE), 2, "alice nonce counts her sets only");
        assertEq(registry.nonceOf(BOB), 1, "bob nonce is independent");
    }

    function testSetAvatarEmitsUserNonceAndCid() public {
        string memory cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
        vm.expectEmit(true, true, true, true);
        emit AvatarSet(ALICE, 1, cid);
        registry.setAvatar(ALICE, cid);
    }

    function testSetAvatarRejectsEmptyCid() public {
        vm.expectRevert(AvatarRegistry.EmptyCid.selector);
        registry.setAvatar(ALICE, "");
    }

    function testSetAvatarRejectsOversizedCid() public {
        string memory huge = string(new bytes(129));
        vm.expectRevert(AvatarRegistry.CidTooLong.selector);
        registry.setAvatar(ALICE, huge);
    }

    event AvatarSet(address indexed user, uint256 indexed nonce, string cid);
}
