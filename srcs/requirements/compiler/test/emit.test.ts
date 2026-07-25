import { describe, expect, it } from "vitest";

import { SPEC_VERSION, StrategySpec } from "../src/ast.js";
import { CompileError, lower } from "../src/ir.js";
import { compileProgram, programHex } from "../src/emit.js";

// The pair from the frozen reference fixture (ReferenceProgram.t.sol):
// token1 < token0, so lt = token1 and the ETH/USD base (token0) is NOT lt.
const token0 = "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a";
const token1 = "0x5991A2dF15A8F6A256D3Ec51E99254Cd3fb576A9";

/// ❄️ FROZEN cross-language fixture — the same hex lives as
/// REFERENCE_PROGRAM_HASH (its keccak) in swap-vm/test/ReferenceProgram.t.sol,
/// where the upstream ProgramBuilder + ArgsBuilders build it. If either side
/// drifts a byte, its test reddens.
const REFERENCE_PROGRAM_HEX =
  "0x0d05006b4b2380211b694aa1769357215de4fac081bf1f309adc325306080e1000960000220e06f05b59d3b200000014005000001504002625a01c180007a120f62849f9a0b5bf2913b396098f7c7019b51a820a110014080000000000000001";

const referenceSpec = StrategySpec.parse({
  specVersion: SPEC_VERSION,
  pair: { token0, token1 },
  size: { amount0: "1.5", amount1: "3000" },
  blocks: [
    { type: "deadline", hours: 24 },
    { type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 150, maxStalenessSecs: 3600, mode: "revert" },
    { type: "inventorySkew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80 },
    { type: "makerFee", bps: 25 },
    { type: "protocolFee", bps: 5, receiver: token0 },
    { type: "curve", kind: "xyc" },
    { type: "salt", value: 1 },
  ],
});

const referenceOpts = {
  chainId: 11155111,
  now: 1_800_000_000,
  pairBase: "token0" as const,
};

describe("byte-identical emit (the riga-19 bar)", () => {
  it("emits the frozen reference program byte-for-byte", () => {
    expect(programHex(compileProgram(referenceSpec, referenceOpts))).toBe(REFERENCE_PROGRAM_HEX);
  });

  it("is deterministic across calls", () => {
    const a = compileProgram(referenceSpec, referenceOpts);
    const b = compileProgram(referenceSpec, referenceOpts);
    expect(programHex(a)).toBe(programHex(b));
  });
});

describe("lowering guards", () => {
  it("throws on a non-canonical block order instead of emitting it", () => {
    const spec = StrategySpec.parse({
      ...referenceSpec,
      blocks: [
        { type: "inventorySkew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80 },
        { type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 150, maxStalenessSecs: 3600, mode: "revert" },
        { type: "curve", kind: "xyc" },
      ],
    });
    expect(() => lower(spec, referenceOpts)).toThrowError(CompileError);
    expect(() => lower(spec, referenceOpts)).toThrowError(/canonical/);
  });

  it("throws on a non-zero maxImproveBps (reserved — improvement leg cut)", () => {
    const spec = StrategySpec.parse({
      ...referenceSpec,
      blocks: [
        { type: "inventorySkew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80, maxImproveBps: 10 },
        { type: "curve", kind: "xyc" },
      ],
    });
    expect(() => lower(spec, referenceOpts)).toThrowError(/reserved/);
  });

  it("throws on an unknown chain instead of guessing a feed", () => {
    expect(() => lower(referenceSpec, { ...referenceOpts, chainId: 1 })).toThrowError(/no feed registry/);
  });

  it("honours the demo feedOverride (MockAggregatorV3 path)", () => {
    const mock = "0x00000000000000000000000000000000DeaDBeef" as const;
    const hex = programHex(
      compileProgram(referenceSpec, {
        ...referenceOpts,
        feedOverride: { address: mock, decimals: 8 },
      }),
    );
    expect(hex).toContain(mock.slice(2).toLowerCase());
    expect(hex).not.toContain("694aa1769357215de4fac081bf1f309adc325306");
  });
});

describe("scaling", () => {
  it("resolves deadline hours against opts.now (uint40)", () => {
    // 1_800_000_000 + 86_400 = 1_800_086_400 = 0x6B4B2380 → bytes5 006b4b2380
    expect(REFERENCE_PROGRAM_HEX).toContain("0d05006b4b2380");
  });

  it("scales LLM bps (1e4 base) into Fee.sol's 1e9 base", () => {
    // makerFee 25 bps → 2_500_000 = 0x2625A0 as uint32
    expect(REFERENCE_PROGRAM_HEX).toContain("1504002625a0");
  });

  it("encodes a flat concentration band via floor isqrt on the 1e-12 grid", () => {
    const spec = StrategySpec.parse({
      ...referenceSpec,
      blocks: [
        { type: "concentration", priceMin: 1, priceMax: 4 },
        { type: "curve", kind: "xyc" },
      ],
    });
    const hex = programHex(compileProgram(spec, referenceOpts));
    // token0 is NOT lt → P(gt per lt) band inverts: [1/4, 1] → sqrt = [0.5e18, 1e18]
    expect(hex).toContain("06f05b59d3b20000".padStart(64, "0")); // 0.5e18
    expect(hex).toContain("0de0b6b3a7640000".padStart(64, "0")); // 1e18
  });
});
