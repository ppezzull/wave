// recompileAndShip — the autonomous retune EXECUTE arm: dock() → recompile → ship(), then
// evidence.log citing the Swapped entity that caused it. This is the G2 EXECUTE half (the DECIDE
// half is graphDelta → policy.decide). Per AGENT.md posture invariant: ALWAYS autonomous, NEVER
// HITL-gated — retune is disjoint from the {stop, remove, changeOracleBand, askHuman} HITL set.
//
// BLOCKED TODAY: clients/aqua.ts is a throw-stub, so dock()/ship() are not wired. dock/ship are
// 1inch AQUA protocol functions (events Docked/Shipped on IAqua.sol:45-69), NOT router functions
// and NOT a Flaviano deliverable — the only gap is wiring clients/aqua.ts + clients/router.ts
// (Flavio's B3). The default dock/ship surface a clear BLOCKED error, so this arm DECIDES + logs
// but cannot EXECUTE until the aqua client lands. dock/ship/recompile are injectable, so the happy
// path is unit-testable OFFLINE today (no Solidity, no network) and flips on the moment the aqua
// client is wired.
//
// The DECISION is ALWAYS logged (data-caused, citing entityId) whether EXECUTE succeeds or is
// blocked — that record is the proof the retune was caused by a Swapped entity, not a timer.
// Spec: docs/strategy/AGENT.md (MCP writes — retune) + docs/tasks/Flavio.md (recompileAndShip).
import { logEvidence } from "../evidence/log.js";
import type { Hash } from "viem";
import type { PolicyInput } from "../policy/index.js";

export interface RecompileAndShipInput {
  strategyId: string;
  entityId: string; // the Swapped entity id that caused the retune (data-caused proof anchor)
  query: string; // the query that surfaced the delta
  delta: PolicyInput; // the snapshot fed to decide()
  program?: `0x${string}`; // recompiled bytecode to ship (else recompile() supplies it)
}

/** Injectable execution surface — defaults surface the BLOCKED state; tests pass stubs. */
export interface RetuneArmDeps {
  /** Withdraw the strategy from Aqua (aqua.dock). Default throws BLOCKED (clients/aqua.ts not wired). */
  dock?: (strategyId: string) => Promise<Hash>;
  /** Recompile the (adjusted) spec → new bytecode. Default throws BLOCKED (compiler call TBD). */
  recompile?: (strategyId: string) => Promise<`0x${string}`>;
  /** Re-ship the recompiled strategy to Aqua (aqua.ship). Default throws BLOCKED (clients/aqua.ts not wired). */
  ship?: (strategyId: string, program: `0x${string}`) => Promise<Hash>;
}

const BLOCKED = (fn: string) =>
  `[recompileAndShip] BLOCKED — aqua.${fn}() not wired yet (clients/aqua.ts is a throw-stub). ` +
  `dock/ship are 1inch AQUA fns (IAqua.sol), not router fns. The retune DECIDED (data-caused) ` +
  `but cannot EXECUTE until the aqua client is wired (Flavio's B3).`;

const defaultDock = async (): Promise<Hash> => {
  throw new Error(BLOCKED("dock"));
};
const defaultShip = async (): Promise<Hash> => {
  throw new Error(BLOCKED("ship"));
};
const defaultRecompile = async (): Promise<`0x${string}`> => {
  throw new Error("[recompileAndShip] BLOCKED — no recompile() wired (compiler call TBD).");
};

export interface RetuneResult {
  strategyId: string;
  docked: boolean;
  programHash?: `0x${string}`;
  shipped: boolean;
  dockTxHash?: Hash;
  shipTxHash?: Hash;
  blocked?: string; // present when EXECUTE is blocked (DECIDE still happened + was logged)
}

/**
 * Execute the autonomous retune: dock → recompile → ship, then evidence.log. A BLOCKED execute
 * returns `{ blocked }` (it does NOT throw) so the monitor loop records the attempt + reason —
 * only an unexpected internal failure throws. The decision is logged in every case.
 */
export async function recompileAndShip(
  input: RecompileAndShipInput,
  deps: RetuneArmDeps = {},
): Promise<RetuneResult> {
  const dock = deps.dock ?? defaultDock;
  const recompile = deps.recompile ?? defaultRecompile;
  const ship = deps.ship ?? defaultShip;

  let dockTxHash: Hash | undefined;
  let shipTxHash: Hash | undefined;
  let programHash: `0x${string}` | undefined;
  let blocked: string | undefined;

  try {
    dockTxHash = await dock(input.strategyId);
    programHash = input.program ?? (await recompile(input.strategyId));
    shipTxHash = await ship(input.strategyId, programHash);
  } catch (e) {
    blocked = (e as Error).message;
  }

  const result: RetuneResult = {
    strategyId: input.strategyId,
    docked: !!dockTxHash,
    ...(programHash ? { programHash } : {}),
    shipped: !!shipTxHash,
    ...(dockTxHash ? { dockTxHash } : {}),
    ...(shipTxHash ? { shipTxHash } : {}),
    ...(blocked ? { blocked } : {}),
  };

  // ALWAYS log — data-caused whether EXECUTE succeeded or is blocked. The tx hashes (or the
  // BLOCKED reason) ride in `reason` so the evidence record is self-contained.
  const reason = blocked
    ? `retune DECIDED but EXECUTE blocked — ${blocked}`
    : `autonomous retune executed (dock→recompile→ship); dockTx=${dockTxHash} shipTx=${shipTxHash}`;
  await logEvidence({
    strategyId: input.strategyId,
    entityId: input.entityId,
    query: input.query,
    delta: input.delta,
    action: { type: "retune", reason, ...(shipTxHash ? { trigger: "R1" } : {}) },
  });

  return result;
}
