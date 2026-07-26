#!/usr/bin/env node
// CLI: stdin JSON StrategySpec → stdout JSON { programHex, programHash, bytecode, ... }
// Used by the UI /api/emit route so Next never has to bundle NodeNext .js imports.
import { StrategySpec } from "./ast.js";
import { canonicalize } from "./canonical.js";
import { resolveRejections } from "./rules.js";
import { compileProgram, programHex } from "./emit.js";
import { disassemble, programHash } from "./disassemble.js";

const raw = await new Response(process.stdin).text();
let body: unknown;
try {
  body = JSON.parse(raw);
} catch {
  console.log(JSON.stringify({ error: "invalid JSON on stdin" }));
  process.exit(1);
}

const parsed = StrategySpec.safeParse(body);
if (!parsed.success) {
  console.log(
    JSON.stringify({ error: "invalid StrategySpec", detail: parsed.error.flatten() }),
  );
  process.exit(1);
}

try {
  const { spec: ordered, changed, moves, diff } = canonicalize(parsed.data);
  const { spec, applied } = resolveRejections(ordered);
  const bytes = compileProgram(spec, {
    chainId: 11155111,
    now: Math.floor(Date.now() / 1000),
    pairBase: "token0",
  });
  const bytecode = disassemble(bytes).map((instr) => {
    const argsHex = Array.from(instr.args)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return {
      opcode: instr.op,
      length: `0x${instr.args.length.toString(16).padStart(2, "0")}`,
      args: argsHex ? `0x${argsHex}` : "—",
    };
  });
  console.log(
    JSON.stringify({
      programHex: programHex(bytes),
      programHash: programHash(bytes),
      bytecode,
      canonicalized: changed,
      moves,
      diff: diff || undefined,
      rulesApplied: applied,
    }),
  );
} catch (err) {
  console.log(
    JSON.stringify({
      error: "emit failed",
      detail: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
}
