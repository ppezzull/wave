// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { AquaOpcodes } from "./AquaOpcodes.sol";

/// @title StrategyOpcodes
/// @notice wave's opcode table: the stock Aqua set, unchanged for now
/// @dev The append seam for wave's custom instructions (`_oracleGuard2D`,
///      `_inventorySkew2D`): they get appended at the END of `_opcodes()` here,
///      preserving every stock opcode index. Until then this table is
///      byte-for-byte the Aqua table.
contract StrategyOpcodes is AquaOpcodes {
    constructor(address aqua) AquaOpcodes(aqua) { }
}
