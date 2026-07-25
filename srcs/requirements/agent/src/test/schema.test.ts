// StrategySpec (draft v0) — schema contract tests.
// Mirrors the §1.5 example DSL + the falsifiable rejections. If the frozen
// ast.ts changes a bound or enum, these go RED and flag the divergence.
import { describe, expect, it } from "vitest";
import { StrategySpec } from "../schema.js";

// pad/truncate any seed to a valid 40-hex address (so multi-char seeds work)
const ADDR = (seed: string) => "0x" + (seed + "0".repeat(40)).slice(0, 40);
const OK_PAIR = { token0: ADDR("a1"), token1: ADDR("b2") };

const spec = (blocks: unknown[]) => ({
  specVersion: 1,
  pair: OK_PAIR,
  size: { amount0: "1.5", amount1: "3000" },
  blocks,
});

describe("StrategySpec (draft v0)", () => {
  it("accepts the §1.5 example DSL (6 of 9 blocks)", () => {
    const ok = spec([
      { type: "deadline", hours: 24 },
      { type: "oracle-guard", feed: "ETH/USD", maxDeviationBps: 150, maxStalenessSecs: 3600, mode: "revert" },
      { type: "inventory-skew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80 },
      { type: "maker-fee", bps: 25 },
      { type: "protocol-fee", bps: 5, receiver: ADDR("c3") },
      { type: "curve", kind: "xyc" },
    ]);
    expect(StrategySpec.safeParse(ok).success).toBe(true);
  });

  it("rejects bps out of range (>1000)", () => {
    expect(StrategySpec.safeParse(spec([{ type: "maker-fee", bps: 5000 }])).success).toBe(false);
  });

  it("rejects an unknown block type", () => {
    expect(StrategySpec.safeParse(spec([{ type: "nope", bps: 5 }])).success).toBe(false);
  });

  it("rejects an unknown oracle mode", () => {
    expect(
      StrategySpec.safeParse(
        spec([{ type: "oracle-guard", feed: "ETH/USD", maxDeviationBps: 100, mode: "soft" }]),
      ).success,
    ).toBe(false);
  });

  it("rejects an unknown feed symbol", () => {
    expect(
      StrategySpec.safeParse(
        spec([{ type: "oracle-guard", feed: "PEPE/USD", maxDeviationBps: 100, mode: "revert" }]),
      ).success,
    ).toBe(false);
  });

  it("rejects a malformed address", () => {
    expect(
      StrategySpec.safeParse({
        specVersion: 1,
        pair: { token0: "0xdead", token1: ADDR("b2") },
        size: { amount0: "1", amount1: "1" },
        blocks: [{ type: "curve", kind: "xyc" }],
      }).success,
    ).toBe(false);
  });

  it("rejects targetRatio out of [0,1]", () => {
    expect(
      StrategySpec.safeParse(
        spec([{ type: "inventory-skew", targetRatio: 1.5, slopeBps: 10, maxSkewBps: 50 }]),
      ).success,
    ).toBe(false);
  });

  it("rejects empty blocks", () => {
    expect(StrategySpec.safeParse(spec([])).success).toBe(false);
  });

  it("rejects a wrong specVersion", () => {
    expect(
      StrategySpec.safeParse({ ...spec([{ type: "curve", kind: "xyc" }]), specVersion: 2 }).success,
    ).toBe(false);
  });

  it("applies the maxStalenessSecs default (7200) when omitted", () => {
    const r = StrategySpec.safeParse(
      spec([{ type: "oracle-guard", feed: "ETH/USD", maxDeviationBps: 100, mode: "revert" }]),
    );
    if (!r.success) throw new Error("expected parse success");
    const b = r.data.blocks[0];
    if (!b || b.type !== "oracle-guard") throw new Error("expected oracle-guard block");
    expect(b.maxStalenessSecs).toBe(7200);
  });
});
