import { describe, expect, it } from "vitest";

import { SPEC_VERSION, StrategySpec } from "../src/ast.js";
import { canonicalize, serializeBlock, unifiedDiff } from "../src/canonical.js";

const token0 = "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a";
const token1 = "0x5991A2dF15A8F6A256D3Ec51E99254Cd3fb576A9";

function spec(blocks: unknown[]): StrategySpec {
  return StrategySpec.parse({
    specVersion: SPEC_VERSION,
    pair: { token0, token1 },
    size: { amount0: "1.5", amount1: "3000" },
    blocks,
  });
}

const guard = {
  type: "oracleGuard",
  feed: "ETH/USD",
  maxDeviationBps: 150,
  maxStalenessSecs: 3600,
  mode: "revert",
};
const skew = { type: "inventorySkew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80 };
const curve = { type: "curve", kind: "xyc" };
const makerFee = { type: "makerFee", bps: 25 };

describe("canonicalize", () => {
  it("keeps an already-canonical spec untouched", () => {
    const s = spec([{ type: "deadline", hours: 24 }, guard, skew, makerFee, curve]);
    const r = canonicalize(s);
    expect(r.changed).toBe(false);
    expect(r.moves).toEqual([]);
    expect(r.diff).toBe("");
    expect(r.spec.blocks).toEqual(s.blocks);
  });

  it("moves an out-of-order oracleGuard ahead of inventorySkew (the demo beat)", () => {
    const r = canonicalize(spec([skew, guard, curve]));
    expect(r.changed).toBe(true);
    expect(r.spec.blocks.map((b) => b.type)).toEqual(["oracleGuard", "inventorySkew", "curve"]);
    expect(r.moves).toEqual([
      { kind: "oracleGuard", from: 1, to: 0 },
      { kind: "inventorySkew", from: 0, to: 1 },
    ]);
    // The moved block shows up as a paired removal + addition; the unmoved
    // curve stays a context line. (Which of the two swapped blocks the LCS
    // renders as moved is an implementation detail — assert the invariant.)
    const lines = r.diff.split("\n");
    const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---"));
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(added[0]!.slice(1)).toBe(removed[0]!.slice(1));
    expect(lines).toContain(' {"type":"curve","kind":"xyc"}');
  });

  it("is stable for duplicate kinds (relative order preserved)", () => {
    const feeA = { type: "makerFee", bps: 10 };
    const feeB = { type: "makerFee", bps: 20 };
    const r = canonicalize(spec([curve, feeA, feeB]));
    expect(r.spec.blocks.map((b) => (b.type === "makerFee" ? b.bps : b.type))).toEqual([
      10,
      20,
      "curve",
    ]);
  });

  it("is idempotent and deterministic", () => {
    const s = spec([curve, makerFee, guard]);
    const once = canonicalize(s);
    const twice = canonicalize(once.spec);
    expect(twice.changed).toBe(false);
    expect(canonicalize(s)).toEqual(canonicalize(s));
  });

  it("does not touch non-block fields", () => {
    const s = spec([curve, makerFee]);
    const r = canonicalize(s);
    expect(r.spec.pair).toEqual(s.pair);
    expect(r.spec.size).toEqual(s.size);
    expect(r.spec.specVersion).toBe(SPEC_VERSION);
  });
});

describe("serializeBlock", () => {
  it("emits type first and remaining keys sorted, independent of input order", () => {
    const line = serializeBlock({
      type: "oracleGuard",
      mode: "revert",
      feed: "ETH/USD",
      maxStalenessSecs: 3600,
      maxDeviationBps: 150,
    });
    expect(line).toBe(
      '{"type":"oracleGuard","feed":"ETH/USD","maxDeviationBps":150,"maxStalenessSecs":3600,"mode":"revert"}',
    );
  });
});

describe("unifiedDiff", () => {
  it("renders a swap as one removal and one addition with context", () => {
    expect(unifiedDiff(["a", "b", "c"], ["b", "a", "c"]).split("\n")).toEqual([
      "--- blocks (as written)",
      "+++ blocks (canonical)",
      "@@ -1,3 +1,3 @@",
      "+b",
      " a",
      "-b",
      " c",
    ]);
  });
});
