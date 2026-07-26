// wave compiler — byte emission: IR → SwapVM program bytes.
//
// Encoding per instruction: [opcode:1][argsLength:1][args] (VM.sol runLoop).
// Opcode indices come from the generated slot map (slots.ts ← forge dump),
// NEVER hand-counted. TS-direct emit is the PRIMARY path (§1.5 Move #1);
// byte-identity with the Solidity ProgramBuilder is pinned by the frozen
// reference fixture shared with swap-vm/test/ReferenceProgram.t.sol.

import { concat, lower, type LowerOptions, CompileError, type IrInstruction } from "./ir.js";
import { SLOTS } from "./slots.js";

export function emitProgram(ir: IrInstruction[]): Uint8Array {
  return concat(...ir.map(encodeInstruction));
}

/// Convenience: canonical spec → program bytes in one call.
export function compileProgram(
  spec: Parameters<typeof lower>[0],
  opts: LowerOptions,
): Uint8Array {
  return emitProgram(lower(spec, opts));
}

export function programHex(bytes: Uint8Array): `0x${string}` {
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

function encodeInstruction(instruction: IrInstruction): Uint8Array {
  const slot = SLOTS[instruction.op];
  if (slot === undefined) {
    throw new CompileError("UnknownOpcode", `no slot for ${instruction.op} — regenerate slots`);
  }
  if (instruction.args.length > 0xff) {
    throw new CompileError(
      "ArgsTooLong",
      `${instruction.op} args are ${instruction.args.length} bytes; argsLength is a single byte`,
    );
  }
  return concat(Uint8Array.of(slot, instruction.args.length), instruction.args);
}
