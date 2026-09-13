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
    // WAVE_CHAIN_ID drives the Chainlink feed registry (registry.ts): the agent
    // exports it when writing to a mainnet fork/testnet other than Sepolia. A
    // hardcoded 11155111 here once embedded the SEPOLIA feed address into a
    // chain-1 program — the feed is an EOA on mainnet and every oracleGuard
    // strategy halted (caught by the mainnet-fork E2E).
    chainId: Number(process.env.WAVE_CHAIN_ID ?? "11155111"),
    // Deadline determinism: `now` is quantized to the HOUR so the same spec
    // compiles byte-identical across retries/double-clicks inside the bucket.
    // The deploy idempotency short-circuit compares the on-chain programHash
    // for the computed strategyId — with a fresh Date.now() per compile, every
    // re-ship minted a NEW strategyId (and a duplicate aqua.ship would revert
    // StrategiesMustBeImmutable). Both /api/emit (preview) and the agent's
    // ship spawn this CLI, so preview == ship bytes within the bucket.
    // Crossing a bucket boundary deliberately re-dates the deadline (<=1h
    // drift on a >=24h TTL). LowerOptions.now stays an explicit, honest input.
    now: Math.floor(Date.now() / 1000 / 3600) * 3600,
    pairBase: "token0",
    // Pair decimals (from on-chain decimals() reads by the caller) fold the
    // WETH-18/USDC-6 gap into the oracleGuard byte — see ir.ts.
    ...(process.env.WAVE_TOKEN0_DECIMALS !== undefined
      ? { token0Decimals: Number(process.env.WAVE_TOKEN0_DECIMALS) }
      : {}),
    ...(process.env.WAVE_TOKEN1_DECIMALS !== undefined
      ? { token1Decimals: Number(process.env.WAVE_TOKEN1_DECIMALS) }
      : {}),
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
