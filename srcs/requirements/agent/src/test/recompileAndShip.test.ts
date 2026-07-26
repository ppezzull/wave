// recompileAndShip tests — the retune EXECUTE arm, OFFLINE (injectable dock/recompile/ship).
// The BLOCKED path (no dock/ship on the router yet) returns { blocked } WITHOUT throwing and
// still logs the data-caused decision; the happy path wires stubs + asserts tx hashes hit the
// evidence log. Spec: docs/strategy/AGENT.md (MCP writes — retune, autonomous).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recompileAndShip } from "../actions/recompileAndShip.js";
import type { PolicyInput } from "../policy/index.js";

const NOW = 1_700_000_000;
const path = join(tmpdir(), `wave-retune-${NOW}-${Math.random().toString(36).slice(2)}.jsonl`);
const h = (c: string) => `0x${c.repeat(32)}` as `0x${string}`;

const delta = (now: number): PolicyInput => ({
  committedCapital: 100,
  cumulativeVolume: 25, // 0.25 ≥ 0.20 → R1 (data-caused)
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

const baseInput = {
  strategyId: `0x${"11".repeat(32)}`,
  entityId: "swapped-0x11-1",
  query: "{ swaps(where:{strategy:$id}) { id amountIn } }",
  delta: delta(NOW),
};

describe("recompileAndShip (retune EXECUTE arm)", () => {
  beforeEach(() => {
    process.env.EVIDENCE_PATH = path;
  });
  afterEach(async () => {
    delete process.env.EVIDENCE_PATH;
    await rm(path, { force: true });
  });

  it("surfaces BLOCKED (no dock/ship) WITHOUT throwing — DECIDE still logged", async () => {
    const r = await recompileAndShip(baseInput);
    expect(r.shipped).toBe(false);
    expect(r.docked).toBe(false);
    expect(r.blocked).toMatch(/BLOCKED.*dock/);
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry.entityId).toBe("swapped-0x11-1"); // data-caused anchor
    expect(entry.action.type).toBe("retune");
    expect(entry.action.reason).toMatch(/EXECUTE blocked/);
  });

  it("executes dock→recompile→ship when the deps are wired (happy path)", async () => {
    const DOCK = h("aa");
    const SHIP = h("bb");
    const PROG = h("cc");
    const r = await recompileAndShip(baseInput, {
      dock: async () => DOCK,
      recompile: async () => PROG,
      ship: async () => SHIP,
    });
    expect(r.docked).toBe(true);
    expect(r.shipped).toBe(true);
    expect(r.dockTxHash).toBe(DOCK);
    expect(r.shipTxHash).toBe(SHIP);
    expect(r.programHash).toBe(PROG);
    const entry = JSON.parse((await readFile(path, "utf8")).trim());
    expect(entry.action.reason).toContain(DOCK);
    expect(entry.action.reason).toContain(SHIP);
    expect(entry.action.trigger).toBe("R1");
  });

  it("uses the supplied program and skips recompile()", async () => {
    const PROG = h("cc");
    const r = await recompileAndShip(
      { ...baseInput, program: PROG },
      {
        dock: async () => h("aa"),
        ship: async () => h("bb"),
        // no recompile — program supplied directly; defaultRecompile must NOT be called
      },
    );
    expect(r.programHash).toBe(PROG);
    expect(r.shipped).toBe(true);
  });
});
