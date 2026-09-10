// retuneStream tests — the SSE feed's pure seams + runTick end-to-end, OFFLINE (every
// poll injected; decide() is pure; evidence lands in a tmpdir). Runs in `npm run test`.
// Spec: task #31 — the UI's /api/stream proxies GET /api/stream/retune; dedup is
// MANDATORY because poll() is a snapshot, not a diff (same verdict would re-toast forever).
import { describe, it, expect } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actionToEvent, dedupTick, runTick } from "../mastra/routes/retune-stream.js";
import type { PolicyAction, PolicyInput } from "../policy/index.js";
import type { DeltaSource, StrategyDelta } from "../monitor/graphDelta.js";

const NOW = 1_700_000_000;
const SID = `0x${"11".repeat(32)}`;

const delta = (entityId: string, strategyId = SID): StrategyDelta => ({
  strategyId,
  entityId,
  query: "{}",
  policyInput: {} as PolicyInput, // decide() never runs in the pure-seam tests below
});

const action = (type: PolicyAction["type"], trigger?: PolicyAction["trigger"]): PolicyAction => ({
  type,
  reason: `reason for ${type}`,
  ...(trigger ? { trigger } : {}),
});

describe("actionToEvent (PolicyAction → UI event)", () => {
  it("noop → null (nothing to stream)", () => {
    expect(actionToEvent(action("noop"), delta("e1"))).toBeNull();
  });

  it("retune/stop/remove → a retune toast citing the data-caused entity id", () => {
    for (const t of ["retune", "stop", "remove"] as const) {
      const e = actionToEvent(action(t, "R1"), delta("swap-9"));
      expect(e).toEqual({ type: "retune", message: `${t} — reason for ${t}`, entityId: "swap-9" });
    }
  });

  it("askHuman → an HITL approval card citing strategy + trigger", () => {
    const e = actionToEvent(action("askHuman", "E1"), delta("e1"));
    expect(e).toEqual({
      type: "hitl",
      action: "retune-approval",
      message: "reason for askHuman (E1)",
      strategyId: SID,
    });
  });
});

describe("dedupTick (the snapshot-is-not-a-diff defense)", () => {
  it("suppresses the same strategy+trigger+entity on the next tick", () => {
    const seen = new Set<string>();
    const acts = [action("retune", "R1"), action("noop")];
    const ds = [delta("swap-9"), delta("swap-10")];
    const first = dedupTick(acts, ds, seen);
    expect(first).toHaveLength(1); // the noop maps to null — only the R1 event survives
    // Next tick, SAME snapshot (no new swaps): everything already seen → silence.
    expect(dedupTick(acts, ds, seen)).toHaveLength(0);
  });

  it("a NEW entity id on the same strategy re-fires — that is a real new cause", () => {
    const seen = new Set<string>();
    dedupTick([action("retune", "R1")], [delta("swap-9")], seen);
    const events = dedupTick([action("retune", "R1")], [delta("swap-10")], seen);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "retune", entityId: "swap-10" });
  });

  it("clears the window at cap (bounded memory on a long-lived connection)", () => {
    const seen = new Set<string>(["k1", "k2"]);
    // At cap at tick START → clears BEFORE inserting, so this key passes despite the
    // window being full, and the old keys are gone.
    const events = dedupTick([action("retune", "R1")], [delta("swap-x")], seen, 2);
    expect(events).toHaveLength(1);
    expect(seen.has("k1")).toBe(false); // the window reset
  });
});

describe("runTick (one poll → decide → dedup, end-to-end offline)", () => {
  // A realistic snapshot: one strategy tripping R1 (cumulativeVolume 25/100 = 0.25 ≥ 0.20),
  // one quiet. Same trigger values as stubDeltaSource / graphDelta.test.ts.
  const firing: PolicyInput = {
    committedCapital: 100,
    cumulativeVolume: 25,
    inventoryShare: 0.5,
    targetShare: 0.5,
    maxSkewBps: 200,
    skewSustainedFills: 0,
    oracleUpdatedAt: NOW,
    oracleMaxStalenessSecs: 3600,
    oracleDeviationBps: 0,
    oracleMaxDeviationBps: 100,
    returnPct24h: 0,
    returnPct7d: 0,
    returnDropFills: 0,
    consecutiveRevertChecks: 0,
    lastSwapAt: NOW,
    status: "active",
    statusChangedAt: NOW,
    now: NOW,
  };
  const quiet: PolicyInput = { ...firing, cumulativeVolume: 1 }; // 0.01 < 0.20 → noop

  /** A poll-counting source — proves the memoized wrapper polls once per tick. */
  const source = (): DeltaSource & { readonly polls: number } => {
    let polls = 0;
    return {
      async poll() {
        polls += 1;
        return [
          { strategyId: SID, entityId: "swap-9", query: "{}", policyInput: firing },
          { strategyId: `0x${"22".repeat(32)}`, entityId: "swap-10", query: "{}", policyInput: quiet },
        ];
      },
      get polls() {
        return polls;
      },
    };
  };

  it("streams the firing strategy once, then stays silent while the snapshot is unchanged", async () => {
    const evidencePath = join(tmpdir(), `wave-evidence-stream-${NOW}-${Math.random().toString(36).slice(2)}.jsonl`);
    process.env.EVIDENCE_PATH = evidencePath;
    try {
      const src = source();
      const seen = new Set<string>();
      const tick1 = await runTick(src, seen);
      expect(tick1).toHaveLength(1);
      expect(tick1[0]).toMatchObject({ type: "retune", entityId: "swap-9" });
      // The same snapshot next tick: deduped to silence (poll is a snapshot, not a diff).
      const tick2 = await runTick(src, seen);
      expect(tick2).toHaveLength(0);
      // ONE poll per tick — the memoized wrapper guarantees decide() saw what we cite.
      expect(src.polls).toBe(2);
    } finally {
      delete process.env.EVIDENCE_PATH;
      await rm(evidencePath, { force: true });
    }
  });
});
