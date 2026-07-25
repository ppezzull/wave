// wave compiler — disassembler + programHash (riga 22).
//
// decode() walks [opcode:1][argsLength:1][args] back into IR using the
// reverse slot map; emit → decode round-trips exactly (pinned by test).
// programHash() is keccak256 of the emitted bytes — the SAME value
// EnsStrategyRouter.announceStrategy computes on-chain from the shown
// program, and the value the ENS `v0.programhash` record carries. One
// hash, three places, no trust.

import { keccak_256 } from "@noble/hashes/sha3.js";

import { CompileError, type IrInstruction } from "./ir.js";
import { SLOTS, type OpName } from "./slots.js";

const SLOT_TO_OP: ReadonlyMap<number, OpName> = new Map(
  (Object.entries(SLOTS) as [OpName, number][]).map(([op, slot]) => [slot, op]),
);

export function disassemble(bytes: Uint8Array): IrInstruction[] {
  const ir: IrInstruction[] = [];
  let pc = 0;
  while (pc < bytes.length) {
    if (pc + 2 > bytes.length) {
      throw new CompileError("TruncatedProgram", `truncated instruction header at byte ${pc}`);
    }
    const slot = bytes[pc]!;
    const argsLength = bytes[pc + 1]!;
    const op = SLOT_TO_OP.get(slot);
    if (op === undefined) {
      throw new CompileError("UnknownSlot", `byte ${pc}: opcode ${slot} is not in the wave slot map`);
    }
    if (pc + 2 + argsLength > bytes.length) {
      throw new CompileError(
        "TruncatedProgram",
        `${op} at byte ${pc} declares ${argsLength} arg bytes but the program ends early`,
      );
    }
    ir.push({ op, args: bytes.slice(pc + 2, pc + 2 + argsLength) });
    pc += 2 + argsLength;
  }
  return ir;
}

/// keccak256 of the program bytes — identical to the on-chain
/// `keccak256(program)` in `announceStrategy` and to the ENS record.
export function programHash(bytes: Uint8Array): `0x${string}` {
  let hex = "0x";
  for (const b of keccak_256(bytes)) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}
