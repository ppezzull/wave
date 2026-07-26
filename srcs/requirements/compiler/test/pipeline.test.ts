// End-to-end pipeline test (review finding on PRs #22/#26): the two compiler
// halves — canonicalize/rules on one branch chain, lower/emit on the other —
// never met in a test. ir.ts defends the junction with an assert that
// throws on non-canonical order; this file proves the assumption behind it:
// what the reject-and-rewrite side outputs, the lowering side accepts.
//
// The scenario is the §1.5 demo beat end to end: a malicious spec (guard
// AFTER skew) → checkRules rejects → resolveRejections composes the fix →
// compileProgram emits bytes. And the negative: the raw malicious spec fed
// straight to lower() throws.
import { describe, expect, it } from "vitest";

import { SPEC_VERSION, StrategySpec } from "../src/ast.js";
import { canonicalize } from "../src/canonical.js";
import { checkRules, resolveRejections } from "../src/rules.js";
import { CompileError, lower } from "../src/ir.js";
import { compileProgram, programHex } from "../src/emit.js";

const token0 = "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a";
const token1 = "0x5991A2dF15A8F6A256D3Ec51E99254Cd3fb576A9";

const opts = { chainId: 11155111, now: 1_800_000_000, pairBase: "token0" as const };

/// The §1.5 demo beat: oracleGuard written AFTER inventorySkew.
const maliciousSpec = StrategySpec.parse({
  specVersion: SPEC_VERSION,
  pair: { token0, token1 },
  size: { amount0: "1.5", amount1: "3000" },
  blocks: [
    { type: "deadline", hours: 24 },
    { type: "inventorySkew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80 },
    { type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 150, maxStalenessSecs: 3600, mode: "revert" },
    { type: "makerFee", bps: 25 },
    { type: "curve", kind: "xyc" },
    { type: "salt", value: 1 },
  ],
});

describe("reject-and-rewrite → emit, end to end", () => {
  it("rejects the malicious order, and the composed rewrite lowers to bytes", () => {
    const rejections = checkRules(maliciousSpec);
    expect(rejections.map((r) => r.rule)).toEqual(["OracleGuardMustPrecedeSkew"]);

    const { spec: fixed, applied } = resolveRejections(maliciousSpec);
    expect(applied).toEqual(["OracleGuardMustPrecedeSkew"]);

    const bytes = compileProgram(fixed, opts);
    expect(bytes.length).toBeGreaterThan(0);
    // Guard byte-precedes skew in the emitted program (earlier = more outer).
    const hex = programHex(bytes);
    expect(hex.indexOf("211b")).toBeLessThan(hex.indexOf("220e"));
  });

  it("canonicalize() output always satisfies lower()'s order assert", () => {
    // The junction assumption, tested directly.
    const { spec: canonical } = canonicalize(maliciousSpec);
    expect(() => lower(canonical, opts)).not.toThrow();
  });

  it("the raw malicious spec fed straight to lower() throws (junction defended)", () => {
    expect(() => lower(maliciousSpec, opts)).toThrowError(CompileError);
  });

  it("a clean spec flows through untouched: no rejections, same blocks, bytes out", () => {
    const { spec: canonical } = canonicalize(maliciousSpec);
    expect(checkRules(canonical)).toEqual([]);
    const once = programHex(compileProgram(canonical, opts));
    const twice = programHex(compileProgram(resolveRejections(canonical).spec, opts));
    expect(once).toBe(twice);
  });
});
