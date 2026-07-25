// G3 fuzz — every input → a valid StrategySpec OR a typed ZodError, never an
// unhandled exception. (Flavio.md task #17.) Aligned to the frozen ast.ts (camel).
import { describe, it, expect } from "vitest";
import { StrategySpec } from "../schema.js";

describe("StrategySpec.parse is total (G3 fuzz)", () => {
  const shapes: unknown[] = [
    null,
    undefined,
    0,
    "",
    "x",
    [],
    {},
    { specVersion: 1 },
    { specVersion: 1, pair: {}, size: {}, blocks: [] },
    { specVersion: 1, pair: { token0: "bad" }, size: { amount0: "1", amount1: "1" }, blocks: [{ type: "???" }] },
    { blocks: [{ type: "makerFee", bps: -1 }] },
    { blocks: [{ type: "makerFee", bps: 99999 }] },
    {
      specVersion: 1,
      pair: { token0: "0x" + "ab".repeat(20), token1: "0x" + "cd".repeat(20) },
      size: { amount0: "1", amount1: "1" },
      blocks: [{ type: "curve", kind: "nope" }],
    },
  ];

  it("safeParse never throws and always returns a discriminated result", () => {
    for (const s of shapes) {
      const r = StrategySpec.safeParse(s);
      expect(r.success === true || r.success === false).toBe(true);
      if (!r.success) expect(r.error).toBeDefined();
    }
  });

  it("random shapes never throw", () => {
    // deterministic LCG (no Math.random — reproducible failures)
    let seed = 0x9e3779b1 >>> 0;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const types = ["deadline", "oracleGuard", "makerFee", "curve", "salt", "bogus", 3, null];
    for (let i = 0; i < 300; i++) {
      const blocks = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
        type: types[Math.floor(rnd() * types.length)],
        bps: Math.floor(rnd() * 5000) - 500,
        hours: Math.floor(rnd() * 100),
        targetRatio: rnd() * 2,
      }));
      const input = {
        specVersion: rnd() > 0.5 ? 1 : 9,
        pair: { token0: "0x" + "0".repeat(40) },
        size: { amount0: String(rnd()), amount1: "1" },
        blocks,
      };
      expect(() => StrategySpec.safeParse(input)).not.toThrow();
    }
  });
});
