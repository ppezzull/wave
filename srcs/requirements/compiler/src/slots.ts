// wave compiler — opcode slot map. GENERATED COPY, do not edit by hand.
//
// Source of truth: srcs/requirements/swap-vm/config/slots.json, written by
// `forge script script/DumpOpcodeSlots.s.sol` (pointer-resolved from
// StrategyOpcodes._opcodes(); slot 0 is sacrificed upstream as the array
// length, so indices are NEVER hand-counted). Snapshot tests on both sides
// pin this copy to that file: slots.test.ts here,
// StrategyOpcodesSlots.t.sol there. Drift fails the suite, not the demo.

export const SLOTS_SPEC_VERSION = 1 as const;
export const TABLE_LENGTH = 35 as const;

export const SLOTS = {
  _deadline: 13,
  _salt: 20,
  _xycSwapXD: 17,
  _xycConcentrateGrowLiquidity2D: 18,
  _decayXD: 19,
  _flatFeeAmountInXD: 21,
  _aquaProtocolFeeAmountInXD: 28,
  _oracleGuard2D: 33,
  _inventorySkew2D: 34,
} as const;

export type OpName = keyof typeof SLOTS;
