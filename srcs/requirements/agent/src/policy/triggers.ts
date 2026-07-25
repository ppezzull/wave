// Pure trigger predicates. Each inspects PolicyInput (+ thresholds) and returns
// a TriggerFire or null. No side effects, no LLM, no I/O.
// Spec: docs/strategy/AGENT.md — "The strategy-change/removal policy".

import type { PolicyInput, TriggerFire } from "./types.js";
import { THRESHOLDS } from "./thresholds.js";

const skewDriftBps = (i: PolicyInput): number =>
  Math.abs(i.inventoryShare - i.targetShare) * 10_000;

// ─────────────────────────── Retune triggers (autonomous, never HITL) ───────

/** R1 — cumulative volume drift past committed capital. */
export const R1 = (i: PolicyInput): TriggerFire | null => {
  if (i.committedCapital <= 0) return null;
  const drift = i.cumulativeVolume / i.committedCapital;
  return drift >= THRESHOLDS.cumulativeVolumeDrift
    ? { id: "R1", reason: `cumulativeVolume/committedCapital ${drift.toFixed(3)} ≥ ${THRESHOLDS.cumulativeVolumeDrift}` }
    : null;
};

/** R2 — inventory skew drift sustained over N fills. */
export const R2 = (i: PolicyInput): TriggerFire | null => {
  const drift = skewDriftBps(i);
  return drift > i.maxSkewBps && i.skewSustainedFills >= THRESHOLDS.skewSustainedFillCount
    ? { id: "R2", reason: `inventory skew ${drift.toFixed(0)}bps > ${i.maxSkewBps}bps sustained ${i.skewSustainedFills} fills` }
    : null;
};

/** R3 — oracle deviation approaching the band edge. */
export const R3 = (i: PolicyInput): TriggerFire | null => {
  if (i.oracleMaxDeviationBps <= 0) return null;
  const edge = i.oracleDeviationBps / i.oracleMaxDeviationBps; // 0..1
  return edge >= 1 - THRESHOLDS.oracleBandEdgePct
    ? { id: "R3", reason: `oracle deviation ${i.oracleDeviationBps}bps within ${THRESHOLDS.oracleBandEdgePct * 100}% of band ${i.oracleMaxDeviationBps}bps` }
    : null;
};

/** R4 — return collapse (24h << 7d). */
export const R4 = (i: PolicyInput): TriggerFire | null => {
  const collapsed = i.returnPct24h < i.returnPct7d * THRESHOLDS.returnDropRatio;
  return collapsed && i.returnDropFills >= THRESHOLDS.returnDropFillCount
    ? { id: "R4", reason: `returnPct 24h ${i.returnPct24h} < 7d ${i.returnPct7d}×${THRESHOLDS.returnDropRatio}` }
    : null;
};

// ─────────────────────────── Stop triggers (HITL-gated) ─────────────────────

/** S1 — chronic underfunding (agent-side quote reverts). */
export const S1 = (i: PolicyInput): TriggerFire | null =>
  i.consecutiveRevertChecks >= THRESHOLDS.revertCheckStreak
    ? { id: "S1", reason: `chronic underfunding — quote reverted ${i.consecutiveRevertChecks} consecutive checks` }
    : null;

/** S2 — sustained loss. */
export const S2 = (i: PolicyInput): TriggerFire | null =>
  i.returnPct24h < THRESHOLDS.stopReturnPct
    ? { id: "S2", reason: `returnPct 24h ${i.returnPct24h} < ${THRESHOLDS.stopReturnPct}` }
    : null;

/** S3 — oracle dead (staleness past 2× maxStaleness). */
export const S3 = (i: PolicyInput): TriggerFire | null => {
  const age = i.now - i.oracleUpdatedAt;
  return age > i.oracleMaxStalenessSecs * THRESHOLDS.oracleDeadMultiplier
    ? { id: "S3", reason: `oracle stale ${age}s > ${THRESHOLDS.oracleDeadMultiplier}×${i.oracleMaxStalenessSecs}s` }
    : null;
};

/** S4 — idle while funded (no Swap for 72h with cumulativeVolume > 0). */
export const S4 = (i: PolicyInput): TriggerFire | null => {
  const idleHours = (i.now - i.lastSwapAt) / 3600;
  return i.cumulativeVolume > 0 && idleHours >= THRESHOLDS.noSwapHours
    ? { id: "S4", reason: `no Swap for ${idleHours.toFixed(0)}h while cumulativeVolume > 0` }
    : null;
};

// ─────────────────────────── Remove (HITL-gated) ────────────────────────────

/** M1 — grace expired (stopped 7d with zero activity). */
export const M1 = (i: PolicyInput): TriggerFire | null => {
  if (i.status !== "stopped") return null;
  const graceSecs = THRESHOLDS.graceDays * 86_400;
  const stoppedFor = i.now - i.statusChangedAt;
  const noActivity = i.now - i.lastSwapAt > graceSecs;
  return stoppedFor >= graceSecs && noActivity
    ? { id: "M1", reason: `stopped ${THRESHOLDS.graceDays}d with zero activity` }
    : null;
};

export const RETUNE_TRIGGERS = [R1, R2, R3, R4];
