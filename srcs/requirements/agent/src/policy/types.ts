// Policy types — pure, no LLM, no I/O. The "metric is caused by data" proof.
// Spec: docs/strategy/AGENT.md — "The strategy-change/removal policy".

export type StrategyStatus = "active" | "stopped" | "removed";

/** Snapshot of on-chain + subgraph state fed to the policy each tick. */
export interface PolicyInput {
  // capital / volume (R1)
  committedCapital: number; // maker-committed notional
  cumulativeVolume: number; // total swapped notional since ship
  // inventory skew (R2)
  inventoryShare: number; // current balanceLt/(balanceLt+balanceGt), 0..1
  targetShare: number; // target ratio, 0..1
  maxSkewBps: number; // strategy limit
  skewSustainedFills: number; // consecutive fills with drift > maxSkewBps
  // oracle (R3, S3)
  oracleUpdatedAt: number; // unix seconds of last oracle update
  oracleMaxStalenessSecs: number; // strategy limit
  oracleDeviationBps: number; // |implied - oracle| in bps
  oracleMaxDeviationBps: number; // strategy limit
  // return (R4, S2)
  returnPct24h: number;
  returnPct7d: number;
  returnDropFills: number; // fills in the collapsing window
  // underfunding (S1)
  consecutiveRevertChecks: number; // consecutive agent-side quote() reverts
  // liveness (S4, M1)
  lastSwapAt: number; // unix seconds of last Swap
  status: StrategyStatus;
  statusChangedAt: number; // unix seconds (for M1 grace)
  now: number; // tick timestamp (unix seconds)
  // escalation (E3) — forward-compat escape hatch
  outOfModel?: boolean;
}

export type ActionType = "retune" | "stop" | "remove" | "askHuman" | "noop";

export interface PolicyAction {
  type: ActionType;
  reason: string; // human-readable, cites the trigger id
  trigger?: TriggerId; // which trigger fired
}

export type TriggerId =
  | "R1" | "R2" | "R3" | "R4" // retune (autonomous, never HITL)
  | "S1" | "S2" | "S3" | "S4" // stop (HITL)
  | "M1" // remove (HITL)
  | "E1" | "E2" | "E3"; // escalation (askHuman)

export interface TriggerFire {
  id: TriggerId;
  reason: string;
}
