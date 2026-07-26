// assembler — project subgraph entities (Strategy + Swap[]) onto the PolicyInput the pure
// policy.decide() consumes. This is the seam graphDelta's stub filled inline; now it is real
// (polls the live subgraph) and HONEST about what it can and cannot derive.
//
// HONEST DERIVATION (from subgraph Swap[] alone — no fabrication):
//   • cumulativeVolume = Σ amountIn            → R1 (Δvolume/committedCapital) — the data-caused retune
//   • lastSwapAt       = max(swap.timestamp)   → S4 (no swap for 72h)
//   • status           = strategy.status       → M1 grace, stop/remove gating
// NOT YET SOURCED (default to safe values that DON'T trip triggers spuriously — wire when the
// source lands: balances for skew, the aqua client for oracle, a price feed for return%):
//   • inventoryShare/skewSustainedFills → inventoryShare = targetShare (no R2 drift)
//   • oracle*                           → oracleUpdatedAt = now, deviation = 0 (no R3/S3)
//   • returnPct*                        → 0 (no R4/S2)
//   • consecutiveRevertChecks           → 0 (no S1; needs quote() sim via aqua client)
// CONFIG (caller-supplied — production from the strategy spec / ENS records):
//   • committedCapital, targetShare, maxSkewBps, oracle limits
//
// Spec: docs/strategy/AGENT.md (Graph-track scoring — retune caused by a live entity delta) +
// docs/tasks/Flavio.md (graphDelta assembler). Pure + offline-testable.
import type { Strategy, Swap } from "../clients/subgraph.js";
import type { PolicyInput } from "../policy/index.js";

/** Per-strategy config the assembler can't read from the subgraph. Caller supplies it. */
export interface StrategyConfig {
  strategyId: string;
  committedCapital: number; // R1 denominator
  targetShare: number; // 0..1 (R2)
  maxSkewBps: number; // R2 limit
  oracleMaxStalenessSecs: number; // S3 limit
  oracleMaxDeviationBps: number; // R3/S3 limit
  statusChangedAt: number; // unix secs (M1 grace)
}

/** Conservative default when no real config is wired yet. committedCapital is large so an
 *  unsourced strategy can't trip R1 on a few swaps; flip to the real spec config in production. */
export const defaultStrategyConfig = (strategyId: string, now: number): StrategyConfig => ({
  strategyId,
  committedCapital: 1_000_000,
  targetShare: 0.5,
  maxSkewBps: 200,
  oracleMaxStalenessSecs: 3600,
  oracleMaxDeviationBps: 100,
  statusChangedAt: now,
});

/**
 * Pure projection: subgraph Strategy + Swap[] (+ config) → PolicyInput. No I/O, testable offline.
 * `now` is injectable for deterministic tests. See file header for the derivation table.
 */
export function toPolicyInput(
  strategy: Strategy,
  swaps: Swap[],
  cfg: StrategyConfig,
  now: number,
): PolicyInput {
  // R1 — prefer the subgraph's rolled-up fields (real); fall back to Swap[]-derived then config.
  // Number("0") = 0 → `|| X` cascades to the next source when the subgraph reports none.
  const committedCapital = Number(strategy.committedCapital) || cfg.committedCapital;
  const cumulativeVolume =
    Number(strategy.cumulativeVolumeIn) ||
    swaps.reduce((sum, s) => sum + (Number(s.amountIn) || 0), 0);

  // S4/M1 — prefer the subgraph's lastSwapTimestamp; fall back to the latest swap then ship time.
  let lastSwapAt = strategy.lastSwapTimestamp || cfg.statusChangedAt;
  for (const s of swaps) {
    if (s.timestamp > lastSwapAt) lastSwapAt = s.timestamp;
  }

  return {
    // R1 — real volume over real (or fallback) capital
    committedCapital,
    cumulativeVolume,
    // R2 — not sourced (needs balances); inventoryShare = targetShare ⇒ no drift
    inventoryShare: cfg.targetShare,
    targetShare: cfg.targetShare,
    maxSkewBps: cfg.maxSkewBps,
    skewSustainedFills: 0,
    // R3/S3 — not sourced (needs aqua client); fresh + zero deviation ⇒ no fire
    oracleUpdatedAt: now,
    oracleMaxStalenessSecs: cfg.oracleMaxStalenessSecs,
    oracleDeviationBps: 0,
    oracleMaxDeviationBps: cfg.oracleMaxDeviationBps,
    // R4/S2 — not sourced (needs price normalization across token decimals)
    returnPct24h: 0,
    returnPct7d: 0,
    returnDropFills: 0,
    // S1 — not sourced (needs quote() sim)
    consecutiveRevertChecks: 0,
    // S4/M1 — real (lastSwapAt) + config (statusChangedAt)
    lastSwapAt,
    status: strategy.status,
    statusChangedAt: cfg.statusChangedAt,
    now,
  };
}
