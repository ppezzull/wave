// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { ChatVault } from "../src/periphery/ChatVault.sol";

contract ChatVaultTest is Test {
    ChatVault vault;

    address internal constant ALICE = address(0xA11ce);
    address internal constant BOB = address(0xB0b);

    function setUp() public {
        vault = new ChatVault();
    }

    function testStoreIncrementsPerUserNonce() public {
        assertEq(vault.nonceOf(ALICE), 0, "fresh vault has zero nonce");
        vault.store(ALICE, "aGk=");
        vault.store(ALICE, "aGk=");
        vault.store(BOB, "aGk=");
        assertEq(vault.nonceOf(ALICE), 2, "alice nonce counts her stores only");
        assertEq(vault.nonceOf(BOB), 1, "bob nonce is independent");
    }

    function testStoreEmitsUserNonceAndBytes() public {
        bytes memory blob = hex"00112233";
        vm.expectEmit(true, true, true, true);
        emit Stored(ALICE, 1, blob);
        vault.store(ALICE, blob);
    }

    function testStoreRejectsEmptyCiphertext() public {
        vm.expectRevert(ChatVault.EmptyCiphertext.selector);
        vault.store(ALICE, "");
    }

    function testStoreRejectsOversizedCiphertext() public {
        bytes memory blob = new bytes(98_305);
        vm.expectRevert(ChatVault.CiphertextTooLarge.selector);
        vault.store(ALICE, blob);
    }

    event Stored(address indexed user, uint256 indexed nonce, bytes ciphertext);
}
