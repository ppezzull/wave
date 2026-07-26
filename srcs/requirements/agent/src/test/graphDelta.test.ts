// graphDelta skeleton tests — the monitor tick + evidence log, offline (decide() is
// pure, no LLM). Runs in `npm run test` (CI-safe). Spec: docs/strategy/AGENT.md
// (zero-click, data-caused retune) + the R1 cumulative-volume-drift trigger.
import { describe, it, expect } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorTick, stubDeltaSource, type DeltaSource, type StrategyDelta } from "../monitor/graphDelta.js";
import type { PolicyInput } from "../policy/index.js";

const NOW = 1_700_000_000;

// A quiet PolicyInput (no trigger fires) — same safe values as the stub but cumulativeVolume
// below the R1 threshold (0.01 < 0.20).
const quietInput = (now: number): PolicyInput => ({
  committedCapital: 100,
  cumulativeVolume: 1, // 0.01 < 0.20 → no R1
  inventoryShare: 0.5,
  targetShare: 0.5,
  maxSkewBps: 200,
  skewSustainedFills: 0,
  oracleUpdatedAt: now,
  oracleMaxStalenessSecs: 3600,
  oracleDeviationBps: 0,
  oracleMaxDeviationBps: 100,
  returnPct24h: 0,
  returnPct7d: 0,
  returnDropFills: 0,
  consecutiveRevertChecks: 0,
  lastSwapAt: now,
  status: "active",
  statusChangedAt: now,
  now,
});

describe("monitorTick (graphDelta skeleton)", () => {
  it("decides autonomous retune on a stub R1 delta (cumulative-volume drift)", async () => {
    const actions = await monitorTick(stubDeltaSource(NOW));
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe("retune");
    expect(actions[0]!.trigger).toBe("R1"); // data-caused → autonomous, never HITL
  });

  it("noop when no trigger fires", async () => {
    const quiet: DeltaSource = {
      async poll(): Promise<StrategyDelta[]> {
        return [
          {
            strategyId: "s",
            entityId: "e",
            query: "{}",
            policyInput: quietInput(NOW),
          },
        ];
      },
    };
    const actions = await monitorTick(quiet);
    expect(actions[0]!.type).toBe("noop");
  });
});

describe("evidence log", () => {
  it("cites the entity id + verdict (the data-caused proof)", async () => {
    const path = join(tmpdir(), `wave-evidence-${NOW}-${Math.random().toString(36).slice(2)}.jsonl`);
    process.env.EVIDENCE_PATH = path;
    try {
      await monitorTick(stubDeltaSource(NOW));
      const lines = (await readFile(path, "utf8")).trim().split("\n");
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]!);
      expect(entry.entityId).toMatch(/^swapped-/); // the data-caused anchor
      expect(entry.action.type).toBe("retune");
      expect(entry.action.trigger).toBe("R1");
      expect(entry.query).toContain("swaps");
      expect(entry.delta.committedCapital).toBe(100);
    } finally {
      delete process.env.EVIDENCE_PATH;
      await rm(path, { force: true });
    }
  });
});
