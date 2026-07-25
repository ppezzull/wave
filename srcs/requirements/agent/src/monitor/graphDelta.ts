// graphDelta — the monitor tick: poll subgraph deltas → policy.decide() each →
// evidence.log. This is the "zero-click, data-caused retune" beat (AGENT.md Graph-track
// scoring): every decision cites the Swapped entity id that caused it. The 9→10 failure
// mode is a TIME-triggered retune with no entity — so the entityId in the evidence log
// IS the proof the social metric is caused by on-chain capital, not a timer.
//
// SKELETON: the DeltaSource is a STUB (synthetic data) so the decision layer runs
// end-to-end TODAY. Swap `stubDeltaSource` for the real Sepolia subgraph source when
// Pietro's endpoint lands — the DeltaSource interface is unchanged. Spec:
// docs/strategy/AGENT.md (monitorAgent + the closed loop) + Flavio.md (graphDelta).
import { decide } from "../policy/index.js";
import type { PolicyAction, PolicyInput } from "../policy/index.js";
import { logEvidence } from "../evidence/log.js";

/**
 * One subgraph entity delta for one strategy — the unit the monitor evaluates each tick.
 * `entityId` is the Swapped entity id (or eth_getLogs tx hash); citing it in the evidence
 * log is what PROVES the retune is data-caused (not time-triggered). `policyInput` is the
 * assembler output: the delta projected onto the fields decide() consumes.
 */
export interface StrategyDelta {
  strategyId: string;
  entityId: string; // the Swapped entity / log id — the data-caused proof anchor
  query: string; // the GraphQL query (or eth_getLogs filter) that produced this delta
  policyInput: PolicyInput; // delta + strategy config → decide() input
}

/**
 * Pluggable source of strategy deltas. STUB now (stubDeltaSource); swap for the real
 * subgraph client (Pietro's Sepolia endpoint) — same interface, no other code changes.
 */
export interface DeltaSource {
  poll(): Promise<StrategyDelta[]>;
}

/**
 * One monitor tick: poll → decide each → evidence.log. Returns the actions taken.
 * Pure orchestration: decide() is pure (no LLM); logEvidence is the only side effect.
 * This is the seam the missing PolicyInput assembler fills — today the stub builds it.
 */
export async function monitorTick(source: DeltaSource): Promise<PolicyAction[]> {
  const deltas = await source.poll();
  const actions: PolicyAction[] = [];
  for (const d of deltas) {
    const action = decide(d.policyInput);
    await logEvidence({
      strategyId: d.strategyId,
      entityId: d.entityId,
      query: d.query,
      delta: d.policyInput,
      action,
    });
    actions.push(action);
  }
  return actions;
}

/**
 * STUB DeltaSource — synthesizes ONE realistic Swapped delta that trips R1 (cumulative
 * volume drift: 25/100 = 0.25 ≥ THRESHOLDS.cumulativeVolumeDrift 0.20) so the skeleton
 * exercises decide() → autonomous retune end-to-end. All other fields are safe/no-op so
 * ONLY R1 fires (clean retune, not an E1 conflict). REPLACE with the real subgraph
 * source when Pietro's endpoint lands. `now` is injectable for deterministic tests.
 */
export const stubDeltaSource = (now = Math.floor(Date.now() / 1000)): DeltaSource => ({
  async poll(): Promise<StrategyDelta[]> {
    const strategyId = "0xSTUB-STRATEGY-1";
    return [
      {
        strategyId,
        entityId: `swapped-${strategyId}-${now}`, // the data-caused proof anchor
        query: `{ swaps(where: { strategy: "${strategyId}" }, orderBy: timestamp, orderDirection: desc, first: 50) { id amountIn amountOut timestamp } }`,
        policyInput: {
          committedCapital: 100,
          cumulativeVolume: 25, // 25/100 = 0.25 ≥ 0.20 → R1 fires
          inventoryShare: 0.5,
          targetShare: 0.5,
          maxSkewBps: 200,
          skewSustainedFills: 0, // no R2
          oracleUpdatedAt: now,
          oracleMaxStalenessSecs: 3600,
          oracleDeviationBps: 0,
          oracleMaxDeviationBps: 100, // no R3, no S3
          returnPct24h: 0,
          returnPct7d: 0,
          returnDropFills: 0, // no R4, no S2
          consecutiveRevertChecks: 0, // no S1
          lastSwapAt: now, // no S4, no M1
          status: "active",
          statusChangedAt: now,
          now,
        },
      },
    ];
  },
});
