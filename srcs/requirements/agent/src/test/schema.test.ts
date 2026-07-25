// StrategySpec — contract tests, aligned to the frozen compiler AST
// (srcs/requirements/compiler/src/ast.ts, specVersion 1 — PR #19). If the
// freeze drifts from these, they go RED.
import { describe, expect, it } from "vitest";
import { StrategySpec } from "../schema.js";

const ADDR = (seed: string) => "0x" + (seed + "0".repeat(40)).slice(0, 40);
const OK_PAIR = { token0: ADDR("a1"), token1: ADDR("b2") };
const spec = (blocks: unknown[], over: Record<string, unknown> = {}) => ({
  specVersion: 1,
  pair: OK_PAIR,
  size: { amount0: "1.5", amount1: "3000" },
  blocks,
  ...over,
});

describe("StrategySpec (frozen specVersion 1)", () => {
  it("accepts a full spec across all 9 block kinds (lowerCamel)", () => {
    const ok = spec([
      { type: "deadline", hours: 24 },
      { type: "concentration", priceMin: 2500, priceMax: 3000 },
      { type: "decay", periodSecs: 3600 },
      { type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 150, maxStalenessSecs: 3600, mode: "revert" },
      { type: "inventorySkew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80 },
      { type: "makerFee", bps: 25 },
      { type: "protocolFee", bps: 5, receiver: ADDR("c3") },
      { type: "curve", kind: "xyc" },
      { type: "salt", value: 42 },
    ]);
    expect(StrategySpec.safeParse(ok).success).toBe(true);
  });

  it("accepts the two new feeds (LINK/USD, DAI/USD)", () => {
    expect(
      StrategySpec.safeParse(spec([{ type: "oracleGuard", feed: "LINK/USD", maxDeviationBps: 100, mode: "revert" }]))
        .success,
    ).toBe(true);
    expect(
      StrategySpec.safeParse(spec([{ type: "oracleGuard", feed: "DAI/USD", maxDeviationBps: 100, mode: "revert" }]))
        .success,
    ).toBe(true);
  });

  it("rejects kebab-case block types (superseded by the freeze)", () => {
    expect(
      StrategySpec.safeParse(
        spec([{ type: "oracle-guard", feed: "ETH/USD", maxDeviationBps: 100, mode: "revert" }]),
      ).success,
    ).toBe(false);
  });

  it("rejects bps out of range (>1000)", () => {
    expect(StrategySpec.safeParse(spec([{ type: "makerFee", bps: 5000 }])).success).toBe(false);
  });

  it("rejects maxDeviationBps = 0 (floor 1)", () => {
    expect(
      StrategySpec.safeParse(spec([{ type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 0, mode: "revert" }]))
        .success,
    ).toBe(false);
  });

  it("rejects maxStalenessSecs > 65535 (uint16)", () => {
    expect(
      StrategySpec.safeParse(
        spec([{ type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 100, maxStalenessSecs: 70000, mode: "revert" }]),
      ).success,
    ).toBe(false);
  });

  it("rejects concentration priceMin >= priceMax", () => {
    expect(StrategySpec.safeParse(spec([{ type: "concentration", priceMin: 3000, priceMax: 3000 }])).success).toBe(false);
    expect(StrategySpec.safeParse(spec([{ type: "concentration", priceMin: 3000, priceMax: 2500 }])).success).toBe(false);
  });

  it("rejects decay periodSecs out of 1..65535", () => {
    expect(StrategySpec.safeParse(spec([{ type: "decay", periodSecs: 0 }])).success).toBe(false);
    expect(StrategySpec.safeParse(spec([{ type: "decay", periodSecs: 70000 }])).success).toBe(false);
  });

  it("rejects salt without value (required)", () => {
    expect(StrategySpec.safeParse(spec([{ type: "salt" }])).success).toBe(false);
  });

  it("rejects a non-decimal amount (DecimalAmount)", () => {
    expect(
      StrategySpec.safeParse(spec([{ type: "curve", kind: "xyc" }], { size: { amount0: "abc", amount1: "1" } })).success,
    ).toBe(false);
  });

  it("rejects pair.token0 == token1", () => {
    const same = ADDR("a1");
    expect(
      StrategySpec.safeParse(spec([{ type: "curve", kind: "xyc" }], { pair: { token0: same, token1: same } })).success,
    ).toBe(false);
  });

  it("rejects size amount = 0 (strictly positive)", () => {
    expect(
      StrategySpec.safeParse(spec([{ type: "curve", kind: "xyc" }], { size: { amount0: "0", amount1: "1" } })).success,
    ).toBe(false);
  });

  it("rejects an unknown block type / mode / feed", () => {
    expect(StrategySpec.safeParse(spec([{ type: "nope", bps: 5 }])).success).toBe(false);
    expect(
      StrategySpec.safeParse(spec([{ type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 100, mode: "soft" }]))
        .success,
    ).toBe(false);
    expect(
      StrategySpec.safeParse(spec([{ type: "oracleGuard", feed: "PEPE/USD", maxDeviationBps: 100, mode: "revert" }]))
        .success,
    ).toBe(false);
  });

  it("rejects empty blocks / wrong specVersion", () => {
    expect(StrategySpec.safeParse(spec([])).success).toBe(false);
    expect(StrategySpec.safeParse(spec([{ type: "curve", kind: "xyc" }], { specVersion: 2 })).success).toBe(false);
  });

  it("applies the maxStalenessSecs default (7200) when omitted", () => {
    const r = StrategySpec.safeParse(
      spec([{ type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 100, mode: "revert" }]),
    );
    if (!r.success) throw new Error("expected parse success");
    const b = r.data.blocks[0];
    if (!b || b.type !== "oracleGuard") throw new Error("expected oracleGuard block");
    expect(b.maxStalenessSecs).toBe(7200);
  });
});
