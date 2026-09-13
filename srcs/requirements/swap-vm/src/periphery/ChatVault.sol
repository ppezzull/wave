// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

/// @title ChatVault — on-chain storage for encrypted conversation archives.
/// @notice wave's chat conversations back up on-chain as AES-256-GCM
///         ciphertext, scoped to their owner. Privacy comes from
///         CLIENT-SIDE ENCRYPTION (the key is derived from the owner's
///         wallet signature and never leaves their browser) — NOT from access
///         control: ciphertext is public on-chain by design, and the relayer
///         (the announcer EOA) writes on the owner's behalf, so `user` is a
///         parameter the subgraph keys on, not an authenticated identity.
///         Append-only: each store bumps the owner's nonce; restore reads the
///         highest nonce.
contract ChatVault {
    /// @dev Emitted per store. `user` and `nonce` indexed — the subgraph
    ///      filters by user and orders by nonce.
    event Stored(address indexed user, uint256 indexed nonce, bytes ciphertext);

    /// @dev Per-owner append counter (restores take the highest).
    mapping(address => uint256) public nonceOf;

    error EmptyCiphertext();
    error CiphertextTooLarge();

    /// @notice Append a ciphertext blob for `user`. Payable by nobody — the
    ///         announcer relays; gas is the deployment's, not the owner's.
    /// @param user The vault owner (the wallet whose signature derives the
    ///        encryption key).
    /// @param ciphertext AES-256-GCM blob (IV + ct, base64). The contract
    ///        treats it as opaque bytes.
    function store(address user, bytes calldata ciphertext) external {
        if (ciphertext.length == 0) revert EmptyCiphertext();
        // Calldata-size sanity: ~96 KB of base64 ≈ the UI's archive cap.
        if (ciphertext.length > 98_304) revert CiphertextTooLarge();
        uint256 nonce = nonceOf[user] + 1;
        nonceOf[user] = nonce;
        emit Stored(user, nonce, ciphertext);
    }
}
