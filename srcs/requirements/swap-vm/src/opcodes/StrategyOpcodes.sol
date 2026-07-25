// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Context } from "../libs/VM.sol";

import { AquaOpcodes } from "./AquaOpcodes.sol";
import { OracleGuard } from "../instructions/OracleGuard.sol";
import { InventorySkew } from "../instructions/InventorySkew.sol";

/// @title StrategyOpcodes
/// @notice wave's opcode table: the stock Aqua set with the two wave
///         instructions APPENDED at the end
/// @dev Append-only — opcode indices are positions in this array, so the
///      stock Aqua indices are preserved byte-for-byte and only two new
///      slots exist: `_oracleGuard2D` then `_inventorySkew2D`. Never insert
///      in the middle; never hand-count an index (resolve via
///      `ProgramBuilder.findOpcode` / the dumped slot map).
contract StrategyOpcodes is AquaOpcodes, OracleGuard, InventorySkew {
    constructor(address aqua) AquaOpcodes(aqua) { }

    function _opcodes()
        internal
        pure
        virtual
        override
        returns (function(Context memory, bytes calldata) internal[] memory result)
    {
        function(Context memory, bytes calldata) internal[] memory stock = super._opcodes();
        result = new function(Context memory, bytes calldata) internal[](stock.length + 2);
        for (uint256 i = 0; i < stock.length; i++) {
            result[i] = stock[i];
        }
        result[stock.length] = OracleGuard._oracleGuard2D;
        result[stock.length + 1] = InventorySkew._inventorySkew2D;
    }
}
