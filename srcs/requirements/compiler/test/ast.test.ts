// ast.ts freeze tests — the §1.5 example (camel identifiers) must parse;
// out-of-bound / unfrozen shapes must reject. Order enforcement is
// canonical.ts's job, NOT tested here (parsing accepts any order).
import { describe, expect, it } from "vitest";

import { Block, StrategySpec, SPEC_VERSION } from "../src/ast.js";

const token0 = "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a";
const token1 = "0x5991A2dF15A8F6A256D3Ec51E99254Cd3fb576A9";

const playbookExample = {
  specVersion: SPEC_VERSION,
  pair: { token0, token1 },
  size: { amount0: "1.5", amount1: "3000" },
  blocks: [
    { type: "deadline", hours: 24 },
    {
      type: "oracleGuard",
      feed: "ETH/USD",
      maxDeviationBps: 150,
      maxStalenessSecs: 3600,
      mode: "revert",
    },
    { type: "inventorySkew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80 },
    { type: "makerFee", bps: 25 },
    { type: "protocolFee", bps: 5, receiver: token0 },
    { type: "curve", kind: "xyc" },
  ],
};

describe("StrategySpec (specVersion 1 freeze)", () => {
  it("parses the PLAYBOOK §1.5 example (camel identifiers)", () => {
    expect(() => StrategySpec.parse(playbookExample)).not.toThrow();
  });

  it("defaults oracleGuard.maxStalenessSecs to 7200", () => {
    const block = Block.parse({
      type: "oracleGuard",
      feed: "ETH/USD",
      maxDeviationBps: 100,
      mode: "clamp",
    });
    expect(block).toMatchObject({ maxStalenessSecs: 7200 });
  });

  it("rejects the kebab-case draft identifiers", () => {
    expect(
      Block.safeParse({
        type: "oracle-guard",
        feed: "ETH/USD",
        maxDeviationBps: 100,
        mode: "revert",
      }).success,
    ).toBe(false);
  });

  it("rejects bps above the 1000 ceiling", () => {
    expect(Block.safeParse({ type: "makerFee", bps: 1001 }).success).toBe(false);
  });

  it("rejects an address where a feed symbol is required", () => {
    expect(
      Block.safeParse({
        type: "oracleGuard",
        feed: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
        maxDeviationBps: 100,
        mode: "revert",
      }).success,
    ).toBe(false);
  });

  it("rejects maxStalenessSecs above the uint16 on-chain arg", () => {
    expect(
      Block.safeParse({
        type: "oracleGuard",
        feed: "ETH/USD",
        maxDeviationBps: 100,
        maxStalenessSecs: 86_400,
        mode: "revert",
      }).success,
    ).toBe(false);
  });

  it("rejects an inverted concentration band", () => {
    expect(
      Block.safeParse({ type: "concentration", priceMin: 2, priceMax: 1 })
        .success,
    ).toBe(false);
  });

  it("rejects a salt without an explicit value (deterministic emit)", () => {
    expect(Block.safeParse({ type: "salt" }).success).toBe(false);
  });

  it("rejects unknown block types", () => {
    expect(Block.safeParse({ type: "yolo" }).success).toBe(false);
  });

  it("rejects an identical token pair", () => {
    expect(
      StrategySpec.safeParse({
        ...playbookExample,
        pair: { token0, token1: token0 },
      }).success,
    ).toBe(false);
  });

  it("rejects float-precision amounts (must be decimal strings)", () => {
    expect(
      StrategySpec.safeParse({
        ...playbookExample,
        size: { amount0: 1.5, amount1: "3000" },
      }).success,
    ).toBe(false);
  });
});
