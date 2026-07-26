// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { Test } from "forge-std/Test.sol";

import { StrategyOpcodes } from "../src/opcodes/StrategyOpcodes.sol";
import { Controls, ControlsArgsBuilder } from "../src/instructions/Controls.sol";
import { XYCSwap } from "../src/instructions/XYCSwap.sol";
import { Fee, FeeArgsBuilder } from "../src/instructions/Fee.sol";
import { OracleGuard, OracleGuardArgsBuilder } from "../src/instructions/OracleGuard.sol";
import { InventorySkew, InventorySkewArgsBuilder } from "../src/instructions/InventorySkew.sol";

import { Program, ProgramBuilder } from "./utils/ProgramBuilder.sol";

/// @notice The Solidity half of the BYTE-IDENTICAL cross-check (riga 19): the
///         reference strategy program, built with the upstream ProgramBuilder
///         + ArgsBuilders, must hash to the frozen fixture. The compiler's
///         `emit.test.ts` builds THE SAME program from a StrategySpec and
///         asserts the same hex — if either side drifts a byte, its test
///         reddens. Fixture params are arbitrary but FROZEN.
contract ReferenceProgramTest is Test, StrategyOpcodes {
    using ProgramBuilder for Program;

    /// keccak256 of the frozen reference program bytes; the same hex is
    /// frozen in compiler/test/emit.test.ts.
    bytes32 private constant REFERENCE_PROGRAM_HASH =
        0xade72c01e03f1f3d3a6dbebbe103d02a17ae1531227a03b58ff80597e939fd26;

    address private constant ORACLE = 0x694AA1769357215DE4FAC081bf1f309aDC325306; // Sepolia ETH/USD
    address private constant FEE_RECEIVER = 0xF62849F9A0B5Bf2913b396098F7c7019b51A820a;

    constructor() StrategyOpcodes(address(0)) { }

    function _referenceProgram() private view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(Controls._deadline, ControlsArgsBuilder.buildDeadline(uint40(1_800_086_400))),
            p.build(OracleGuard._oracleGuard2D, OracleGuardArgsBuilder.build(ORACLE, 8, 3600, 150, 0, 0)),
            p.build(InventorySkew._inventorySkew2D, InventorySkewArgsBuilder.build(0.5e18, 20, 80, 0)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(2_500_000)), // 25 bps in 1e9 base
            p.build(Fee._aquaProtocolFeeAmountInXD, FeeArgsBuilder.buildProtocolFee(500_000, FEE_RECEIVER)), // 5 bps
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, ControlsArgsBuilder.buildSalt(uint64(1)))
        );
    }

    function test_ReferenceProgram_MatchesFrozenFixture() public view {
        bytes memory program = _referenceProgram();
        assertEq(keccak256(program), REFERENCE_PROGRAM_HASH, "reference program drifted from the frozen fixture");
    }

    function test_PrintReferenceProgram() public {
        emit log_named_bytes("reference program", _referenceProgram());
        emit log_named_bytes32("keccak256", keccak256(_referenceProgram()));
    }
}
