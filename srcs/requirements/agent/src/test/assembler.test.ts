// assembler tests — the subgraph→PolicyInput projection + the real subgraphDeltaSource,
// OFFLINE (stub subgraph surface, pure decide()). R1 fires on HONEST cumulative-volume drift
// (Σ amountIn / committedCapital); unsourced triggers stay dormant (no fabrication).
// Spec: docs/strategy/AGENT.md (Graph-track — retune caused by a live entity delta).
import { describe, it, expect } from "vitest";
import { toPolicyInput, defaultStrategyConfig } from "../monitor/assembler.js";
import { subgraphDeltaSource } from "../monitor/graphDelta.js";
import { decide } from "../policy/index.js";
import type { Strategy, Swap } from "../clients/subgraph.js";

const NOW = 1_700_000_000;
const SID = `0x${"11".repeat(32)}` as const;

const strategy = (id = SID, status: Strategy["status"] = "active", over: Partial<Strategy> = {}): Strategy => ({
  id,
  programHash: `0x${"ab".repeat(32)}`,
  ensNode: `0x${"22".repeat(32)}`,
  status,
  // The subgraph's rolled-up fields (v0.0.3); default to "no data yet" so the fallback chain
  // (→ Swap[]-derived → config) is exercised. Override via `over` to test real-field preference.
  cumulativeVolumeIn: "0",
  cumulativeVolumeOut: "0",
  committedCapital: "0",
  swapCount: 0,
  lastSwapTimestamp: 0,
  followerCount: 0,
  ...over,
});

const swap = (id: string, amountIn: string, ts: number): Swap => ({
  id,
  strategyId: SID,
  amountIn,
  amountOut: "0",
  timestamp: ts,
});

// The strategy shipped at SHIP (in the past); swaps happen after — the realistic ordering the
// assembler assumes (lastSwapAt seeds at ship time, then takes the max swap timestamp).
const SHIP = NOW - 10_000;
const cfg = (capital: number) => ({ ...defaultStrategyConfig(SID, SHIP), committedCapital: capital });

describe("toPolicyInput (subgraph Strategy+Swap[] → PolicyInput)", () => {
  it("sums amountIn into cumulativeVolume and takes the latest swap timestamp", () => {
    const swaps = [swap("s1", "10", NOW - 100), swap("s2", "15", NOW - 10)];
    const pi = toPolicyInput(strategy(), swaps, cfg(100), NOW);
    expect(pi.cumulativeVolume).toBe(25);
    expect(pi.lastSwapAt).toBe(NOW - 10);
    expect(pi.status).toBe("active");
  });

  it("fires R1 (autonomous retune) when cumulativeVolume/committedCapital ≥ 0.20", () => {
    const swaps = [swap("s1", "25", NOW)]; // 25/100 = 0.25 ≥ 0.20
    const action = decide(toPolicyInput(strategy(), swaps, cfg(100), NOW));
    expect(action.type).toBe("retune");
    expect(action.trigger).toBe("R1"); // data-caused → autonomous, never HITL
  });

  it("stays noop below the R1 threshold", () => {
    const swaps = [swap("s1", "10", NOW)]; // 10/100 = 0.10 < 0.20
    expect(decide(toPolicyInput(strategy(), swaps, cfg(100), NOW)).type).toBe("noop");
  });

  it("PREFERS the subgraph's real rolled-up fields over Swap[]-derived + config", () => {
    // strategy reports real volume + capital (Aqua Pushed−Pulled); no swaps, capital≠cfg.
    const s = strategy(SID, "active", { cumulativeVolumeIn: "40", committedCapital: "100" });
    const pi = toPolicyInput(s, [], cfg(999_999), NOW);
    expect(pi.cumulativeVolume).toBe(40); // real field, NOT cfg/fallback
    expect(pi.committedCapital).toBe(100); // real field, NOT cfg(999_999)
    expect(decide(pi).trigger).toBe("R1"); // 40/100 = 0.40 ≥ 0.20 — real, data-caused
  });

  it("sets safe defaults so unsourced triggers (R2/R3/S1/S3) don't fire spuriously", () => {
    const pi = toPolicyInput(strategy(), [], cfg(100), NOW);
    expect(pi.inventoryShare).toBe(pi.targetShare); // no R2 drift
    expect(pi.oracleDeviationBps).toBe(0); // no R3/S3
    expect(pi.skewSustainedFills).toBe(0);
    expect(pi.consecutiveRevertChecks).toBe(0); // no S1
  });

  it("falls back lastSwapAt → statusChangedAt when there are no swaps", () => {
    const pi = toPolicyInput(strategy(), [], cfg(100), NOW);
    expect(pi.lastSwapAt).toBe(pi.statusChangedAt);
  });
});

describe("subgraphDeltaSource (real DeltaSource, offline)", () => {
  it("produces one StrategyDelta per strategy with entityId = the LATEST swap id", async () => {
    const source = {
      listStrategies: async () => [strategy()],
      // subgraph returns desc-by-timestamp; newest first.
      getSwapHistory: async () => [swap("latest", "25", NOW), swap("older", "5", NOW - 50)],
    };
    const ds = subgraphDeltaSource({ source, now: NOW, configProvider: () => cfg(100) });
    const deltas = await ds.poll();
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.entityId).toBe("latest"); // the data-caused proof anchor
    expect(deltas[0]!.strategyId).toBe(SID);
    expect(deltas[0]!.policyInput.cumulativeVolume).toBe(30);
    expect(deltas[0]!.query).toContain("swaps");
  });

  it("yields NO deltas when the subgraph has no strategies (not deployed yet)", async () => {
    const source = { listStrategies: async () => [], getSwapHistory: async () => [] };
    const ds = subgraphDeltaSource({ source, now: NOW });
    expect(await ds.poll()).toEqual([]);
  });

  it("uses the strategy id as entityId when there are no swaps", async () => {
    const source = { listStrategies: async () => [strategy()], getSwapHistory: async () => [] };
    const ds = subgraphDeltaSource({ source, now: NOW, configProvider: () => cfg(100) });
    const deltas = await ds.poll();
    expect(deltas[0]!.entityId).toBe(SID);
  });
});
