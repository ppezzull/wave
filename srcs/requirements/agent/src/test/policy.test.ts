// Policy tests — falsifiable, RED-on-mutation. If you mutate decide()'s
// precedence (e.g. check R* before S3), these go RED. Spec: AGENT.md.
import { describe, expect, it } from "vitest";
import { decide } from "../policy/decide.js";
import type { PolicyInput } from "../policy/types.js";

const NOW = 1_000_000_000;

/** A healthy, active strategy with no trigger firing. */
const base = (): PolicyInput => ({
  committedCapital: 10_000,
  cumulativeVolume: 0,
  inventoryShare: 0.5,
  targetShare: 0.5,
  maxSkewBps: 200,
  skewSustainedFills: 0,
  oracleUpdatedAt: NOW,
  oracleMaxStalenessSecs: 7200,
  oracleDeviationBps: 10,
  oracleMaxDeviationBps: 150,
  returnPct24h: 0.01,
  returnPct7d: 0.05,
  returnDropFills: 0,
  consecutiveRevertChecks: 0,
  lastSwapAt: NOW,
  status: "active",
  statusChangedAt: NOW,
  now: NOW,
});

describe("decide — base case", () => {
  it("returns noop when nothing fires", () => {
    expect(decide(base()).type).toBe("noop");
  });
});

describe("decide — retune triggers (autonomous, never HITL)", () => {
  it("R1 fires retune (volume drift)", () => {
    const a = decide({ ...base(), cumulativeVolume: 2500 }); // 0.25 ≥ 0.20
    expect(a.type).toBe("retune");
    expect(a.trigger).toBe("R1");
  });

  it("R2 fires retune (sustained skew)", () => {
    const a = decide({ ...base(), inventoryShare: 0.8, skewSustainedFills: 3 }); // 3000bps > 200
    expect(a.type).toBe("retune");
    expect(a.trigger).toBe("R2");
  });
});

describe("decide — stop precedence > retune (falsifiable)", () => {
  it("S3 + R1 → stop, NOT retune (oracle dead outranks retune)", () => {
    const a = decide({
      ...base(),
      oracleUpdatedAt: NOW - 20_000, // 20000s > 2×7200
      cumulativeVolume: 2500, // R1 also fires
    });
    expect(a.type).toBe("stop");
    expect(a.trigger).toBe("S3");
  });

  it("S1 + R1 → stop (chronic underfund outranks retune)", () => {
    const a = decide({
      ...base(),
      consecutiveRevertChecks: 3,
      cumulativeVolume: 2500,
    });
    expect(a.type).toBe("stop");
    expect(a.trigger).toBe("S1");
  });
});

describe("decide — retune-before-stop on S2 + R* (falsifiable)", () => {
  it("S2 + R1 → retune (give it a chance), not stop", () => {
    const a = decide({
      ...base(),
      returnPct24h: -0.2, // S2
      cumulativeVolume: 2500, // R1
    });
    expect(a.type).toBe("retune");
    expect(a.trigger).toBe("R1");
  });

  it("S2 alone → stop", () => {
    const a = decide({ ...base(), returnPct24h: -0.2 });
    expect(a.type).toBe("stop");
    expect(a.trigger).toBe("S2");
  });
});

describe("decide — remove (M1)", () => {
  it("M1 → remove after grace", () => {
    const a = decide({
      ...base(),
      status: "stopped",
      statusChangedAt: NOW - 8 * 86_400,
      lastSwapAt: NOW - 8 * 86_400,
    });
    expect(a.type).toBe("remove");
    expect(a.trigger).toBe("M1");
  });
});

describe("decide — escalation (askHuman)", () => {
  it("E1 — two retune directions conflict → askHuman", () => {
    const a = decide({
      ...base(),
      cumulativeVolume: 2500, // R1
      inventoryShare: 0.8, // R2 drift
      skewSustainedFills: 3, // R2 sustained
    });
    expect(a.type).toBe("askHuman");
    expect(a.trigger).toBe("E1");
  });

  it("E3 — out-of-model signal → askHuman", () => {
    const a = decide({ ...base(), outOfModel: true });
    expect(a.type).toBe("askHuman");
    expect(a.trigger).toBe("E3");
  });
});

describe("decide — HITL/retune disjointness (structural invariant)", () => {
  it("a stop/remove/askHuman result is never a retune", () => {
    const cases: PolicyInput[] = [
      { ...base(), oracleUpdatedAt: NOW - 20_000 }, // S3 → stop
      { ...base(), returnPct24h: -0.2 }, // S2 → stop
      { ...base(), consecutiveRevertChecks: 3 }, // S1 → stop
    ];
    for (const c of cases) {
      const a = decide(c);
      expect(a.type).not.toBe("retune");
    }
  });
});
