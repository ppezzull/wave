import { describe, expect, it } from "vitest";

import { SPEC_VERSION, StrategySpec } from "../src/ast.js";
import { checkRules, resolveRejections, RULES } from "../src/rules.js";

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
  mode: "revert",
};
const skew = { type: "inventorySkew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80 };
const curve = { type: "curve", kind: "xyc" };

describe("RULES surface", () => {
  it("declares exactly the 6 frozen rule names", () => {
    expect(RULES.map((r) => r.name)).toEqual([
      "OracleGuardMustPrecedeSkew",
      "ProtocolFeeLeMakerFee",
      "SaltMustBeTerminal",
      "OracleStalenessRequiresGuard",
      "FeeAfterCurve",
      "NoDuplicateDeadline",
    ]);
  });
});

describe("OracleGuardMustPrecedeSkew", () => {
  it("accepts guard-before-skew and specs missing either block", () => {
    expect(checkRules(spec([guard, skew, curve]))).toEqual([]);
    expect(checkRules(spec([skew, curve]))).toEqual([]);
    expect(checkRules(spec([guard, curve]))).toEqual([]);
  });

  it("rejects skew-before-guard with a canonical rewrite + moves + diff (the demo beat)", () => {
    const rejections = checkRules(spec([skew, guard, curve]));
    expect(rejections).toHaveLength(1);
    const r = rejections[0]!;
    expect(r.rule).toBe("OracleGuardMustPrecedeSkew");
    expect(r.message).toContain("one-sided");
    expect(r.rewrite!.blocks.map((b) => b.type)).toEqual(["oracleGuard", "inventorySkew", "curve"]);
    expect(r.moves!.length).toBeGreaterThan(0);
    expect(r.diff).toContain("@@");
    // The rewrite itself passes every rule.
    expect(checkRules(r.rewrite!)).toEqual([]);
  });
});

describe("ProtocolFeeLeMakerFee", () => {
  it("accepts protocolFee at or below makerFee", () => {
    expect(
      checkRules(
        spec([{ type: "makerFee", bps: 25 }, { type: "protocolFee", bps: 25, receiver: token0 }, curve]),
      ),
    ).toEqual([]);
  });

  it("rejects protocolFee above makerFee and clamps it in the rewrite", () => {
    const rejections = checkRules(
      spec([{ type: "makerFee", bps: 10 }, { type: "protocolFee", bps: 30, receiver: token0 }, curve]),
    );
    expect(rejections).toHaveLength(1);
    const r = rejections[0]!;
    expect(r.rule).toBe("ProtocolFeeLeMakerFee");
    expect(r.message).toContain("30 bps");
    const rewrittenProtocol = r.rewrite!.blocks.find((b) => b.type === "protocolFee");
    expect(rewrittenProtocol).toMatchObject({ bps: 10 });
    expect(checkRules(r.rewrite!)).toEqual([]);
  });

  it("rejects protocolFee with no makerFee at all (implicit 0)", () => {
    const rejections = checkRules(spec([{ type: "protocolFee", bps: 5, receiver: token0 }, curve]));
    expect(rejections.map((r) => r.rule)).toEqual(["ProtocolFeeLeMakerFee"]);
    const rewrittenProtocol = rejections[0]!.rewrite!.blocks.find((b) => b.type === "protocolFee");
    expect(rewrittenProtocol).toMatchObject({ bps: 0 });
  });
});

describe("multiple violations", () => {
  it("reports every violated rule, one Rejection each", () => {
    const rejections = checkRules(
      spec([skew, guard, { type: "protocolFee", bps: 30, receiver: token0 }, curve]),
    );
    expect(rejections.map((r) => r.rule).sort()).toEqual([
      "OracleGuardMustPrecedeSkew",
      "ProtocolFeeLeMakerFee",
    ]);
  });
});

describe("stubbed rules", () => {
  it("always pass until implemented (frozen surface, incremental predicates)", () => {
    // A salt in the middle and two deadlines would violate the stubs once
    // implemented — today they must NOT reject.
    const s = spec([
      { type: "deadline", hours: 1 },
      { type: "salt", value: 7 },
      { type: "deadline", hours: 2 },
      curve,
    ]);
    expect(checkRules(s)).toEqual([]);
  });
});

describe("resolveRejections (composed rewrite — the authoritative fix)", () => {
  it("returns the spec unchanged when nothing is violated", () => {
    const s = spec([guard, skew, curve]);
    const r = resolveRejections(s);
    expect(r.applied).toEqual([]);
    expect(r.spec).toEqual(s);
  });

  it("composes fixes for a spec violating BOTH implemented rules", () => {
    const s = spec([skew, guard, { type: "protocolFee", bps: 30, receiver: token0 }, curve]);
    const r = resolveRejections(s);
    expect(checkRules(r.spec)).toEqual([]); // the composed spec is clean
    expect(r.applied).toContain("OracleGuardMustPrecedeSkew");
    expect(r.applied).toContain("ProtocolFeeLeMakerFee");
    expect(r.spec.blocks.map((b) => b.type)).toEqual([
      "oracleGuard",
      "inventorySkew",
      "protocolFee",
      "curve",
    ]);
    const protocolFee = r.spec.blocks.find((b) => b.type === "protocolFee");
    expect(protocolFee).toMatchObject({ bps: 0 }); // clamped to the absent makerFee
  });

  it("throws when a violated rule has no rewrite instead of emitting a dirty spec", () => {
    const noFix = [
      {
        name: "AlwaysViolated",
        predicate: () => false,
        message: () => "no fix available",
      },
    ];
    expect(() => resolveRejections(spec([curve]), noFix)).toThrowError(/no auto-rewrite/);
  });
});
