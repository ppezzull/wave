// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

/// @title AvatarRegistry — on-chain pointer to a user's IPFS avatar.
/// @notice The image lives on IPFS. This contract only emits the CID so The
///         Graph can index `Author.avatarCid`. Same relay posture as ChatVault:
///         the announcer EOA pays gas and `user` is a parameter, not an
///         authenticated identity. A forged user can overwrite that address's
///         public avatar pointer (a CID, not a secret).
contract AvatarRegistry {
    /// @dev Indexed user + nonce so the subgraph keeps one mutable Author row.
    event AvatarSet(address indexed user, uint256 indexed nonce, string cid);

    mapping(address => uint256) public nonceOf;

    error EmptyCid();
    error CidTooLong();

    /// @notice Publish `user`'s latest IPFS CID (CIDv0 Qm… or CIDv1 bafy…).
    function setAvatar(address user, string calldata cid) external {
        uint256 len = bytes(cid).length;
        if (len == 0) revert EmptyCid();
        if (len > 128) revert CidTooLong();
        uint256 nonce = nonceOf[user] + 1;
        nonceOf[user] = nonce;
        emit AvatarSet(user, nonce, cid);
    }
}
