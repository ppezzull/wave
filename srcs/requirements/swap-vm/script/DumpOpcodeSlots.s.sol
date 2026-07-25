// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Script } from "forge-std/Script.sol";

import { Context } from "../src/libs/VM.sol";
import { StrategyOpcodes } from "../src/opcodes/StrategyOpcodes.sol";
import { Controls } from "../src/instructions/Controls.sol";
import { XYCSwap } from "../src/instructions/XYCSwap.sol";
import { XYCConcentrate } from "../src/instructions/XYCConcentrate.sol";
import { Decay } from "../src/instructions/Decay.sol";
import { Fee } from "../src/instructions/Fee.sol";
import { OracleGuard } from "../src/instructions/OracleGuard.sol";
import { InventorySkew } from "../src/instructions/InventorySkew.sol";

import { Program, ProgramBuilder } from "../test/utils/ProgramBuilder.sol";

// solhint-disable no-console
import { console2 } from "forge-std/console2.sol";

/// @title DumpOpcodeSlots
/// @notice Writes `config/slots.json`: the opcode-index map for every
///         instruction the wave compiler emits, resolved from
///         `StrategyOpcodes._opcodes()` by FUNCTION POINTER — never
///         hand-counted (slot 0 is sacrificed as the array length upstream,
///         so hand-counted indices are off by one by construction).
/// @dev The compiler package commits a copy of this file; snapshot tests on
///      BOTH sides (`StrategyOpcodesSlots.t.sol` here, `slots.test.ts` there)
///      fail on drift. Regenerate with:
///      `forge script script/DumpOpcodeSlots.s.sol`
contract DumpOpcodeSlots is Script, StrategyOpcodes {
    using ProgramBuilder for Program;

    constructor() StrategyOpcodes(address(0)) { }

    function run() external {
        Program memory p = ProgramBuilder.init(_opcodes());

        string memory obj = "slots";
        vm.serializeUint(obj, "_deadline", p.findOpcode(Controls._deadline));
        vm.serializeUint(obj, "_salt", p.findOpcode(Controls._salt));
        vm.serializeUint(obj, "_xycSwapXD", p.findOpcode(XYCSwap._xycSwapXD));
        vm.serializeUint(
            obj, "_xycConcentrateGrowLiquidity2D", p.findOpcode(XYCConcentrate._xycConcentrateGrowLiquidity2D)
        );
        vm.serializeUint(obj, "_decayXD", p.findOpcode(Decay._decayXD));
        vm.serializeUint(obj, "_flatFeeAmountInXD", p.findOpcode(Fee._flatFeeAmountInXD));
        vm.serializeUint(obj, "_aquaProtocolFeeAmountInXD", p.findOpcode(Fee._aquaProtocolFeeAmountInXD));
        vm.serializeUint(obj, "_oracleGuard2D", p.findOpcode(OracleGuard._oracleGuard2D));
        string memory slots = vm.serializeUint(obj, "_inventorySkew2D", p.findOpcode(InventorySkew._inventorySkew2D));

        string memory root = "root";
        vm.serializeUint(root, "specVersion", 1);
        vm.serializeUint(root, "tableLength", _opcodes().length);
        string memory json = vm.serializeString(root, "slots", slots);

        string memory path = string.concat(vm.projectRoot(), "/config/slots.json");
        vm.writeJson(json, path);
        console2.log("slots.json written to", path);
    }
}
// solhint-enable no-console
