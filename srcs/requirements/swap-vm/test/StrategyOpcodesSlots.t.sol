// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Test } from "forge-std/Test.sol";

import { StrategyOpcodes } from "../src/opcodes/StrategyOpcodes.sol";
import { Controls } from "../src/instructions/Controls.sol";
import { XYCSwap } from "../src/instructions/XYCSwap.sol";
import { XYCConcentrate } from "../src/instructions/XYCConcentrate.sol";
import { Decay } from "../src/instructions/Decay.sol";
import { Fee } from "../src/instructions/Fee.sol";
import { OracleGuard } from "../src/instructions/OracleGuard.sol";
import { InventorySkew } from "../src/instructions/InventorySkew.sol";

import { Program, ProgramBuilder } from "./utils/ProgramBuilder.sol";

/// @notice The Solidity half of the slots self-check (riga 20): the committed
///         `config/slots.json` must match a fresh pointer-resolved dump of
///         `StrategyOpcodes._opcodes()`. Drift fails HERE, not at G2.
///         Regenerate with `forge script script/DumpOpcodeSlots.s.sol`.
contract StrategyOpcodesSlotsTest is Test, StrategyOpcodes {
    using ProgramBuilder for Program;

    constructor() StrategyOpcodes(address(0)) { }

    function _slot(string memory json, string memory name) private view returns (uint256) {
        return vm.parseJsonUint(json, string.concat(".slots.", name));
    }

    function test_SlotsJson_MatchesPointerResolvedTable() public view {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/config/slots.json"));
        Program memory p = ProgramBuilder.init(_opcodes());

        assertEq(_slot(json, "_deadline"), p.findOpcode(Controls._deadline), "_deadline drifted");
        assertEq(_slot(json, "_salt"), p.findOpcode(Controls._salt), "_salt drifted");
        assertEq(_slot(json, "_xycSwapXD"), p.findOpcode(XYCSwap._xycSwapXD), "_xycSwapXD drifted");
        assertEq(
            _slot(json, "_xycConcentrateGrowLiquidity2D"),
            p.findOpcode(XYCConcentrate._xycConcentrateGrowLiquidity2D),
            "_xycConcentrateGrowLiquidity2D drifted"
        );
        assertEq(_slot(json, "_decayXD"), p.findOpcode(Decay._decayXD), "_decayXD drifted");
        assertEq(_slot(json, "_flatFeeAmountInXD"), p.findOpcode(Fee._flatFeeAmountInXD), "_flatFeeAmountInXD drifted");
        assertEq(
            _slot(json, "_aquaProtocolFeeAmountInXD"),
            p.findOpcode(Fee._aquaProtocolFeeAmountInXD),
            "_aquaProtocolFeeAmountInXD drifted"
        );
        assertEq(_slot(json, "_oracleGuard2D"), p.findOpcode(OracleGuard._oracleGuard2D), "_oracleGuard2D drifted");
        assertEq(
            _slot(json, "_inventorySkew2D"), p.findOpcode(InventorySkew._inventorySkew2D), "_inventorySkew2D drifted"
        );
        assertEq(vm.parseJsonUint(json, ".tableLength"), _opcodes().length, "table length drifted");
    }

    function test_WaveOpcodes_AppendedAtEnd_StockIndicesPreserved() public pure {
        Program memory p = ProgramBuilder.init(_opcodes());
        uint256 tableLength = _opcodes().length;
        assertEq(p.findOpcode(OracleGuard._oracleGuard2D), tableLength - 2, "guard must be second-to-last");
        assertEq(p.findOpcode(InventorySkew._inventorySkew2D), tableLength - 1, "skew must be last");
    }
}
