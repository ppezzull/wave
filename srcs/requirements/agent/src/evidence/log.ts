// Evidence log — every monitor decision is recorded with the Swapped entity id + the
// GraphQL query + the delta values + the policy verdict. The entity-id citation IS the
// proof the retune is data-caused (the 9→10 failure mode is a time-triggered retune with
// no entity). Spec: docs/strategy/AGENT.md L134 (evidence payload) + Flavio.md L20-21.
//
// SKELETON: appends JSONL to EVIDENCE_PATH (default ./evidence.jsonl). Swap for a
// durable store (LibSQL table) when the action arms land — the logEvidence signature
// stays, so graphDelta.monitorTick doesn't change.
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface EvidenceEntry {
  ts: number; // unix ms
  strategyId: string;
  entityId: string; // the data-caused proof anchor (Swapped entity / log id)
  query: string; // the GraphQL query (or eth_getLogs filter) that produced the delta
  delta: unknown; // the PolicyInput snapshot that fed decide()
  /**
   * The PolicyAction verdict, plus the optional settlement receipts an EXECUTED
   * retune adds. Typed here rather than cast at the call site: the execute arm
   * needs to record what it settled, and a cast would have let the shape drift
   * silently (review #57/B3).
   */
  action: {
    type: string;
    trigger?: string;
    reason: string;
    retunedTo?: string; // the new strategyHash a retune shipped
    dockTx?: string;
    announceTx?: string;
    shipTx?: string;
  };
}

const evidencePath = (): string => process.env.EVIDENCE_PATH ?? "./evidence.jsonl";

/**
 * Append one evidence entry as a JSONL line. Creates the parent dir if needed.
 * Returns the full entry (with ts) so callers/tests can assert without re-reading.
 */
export async function logEvidence(e: Omit<EvidenceEntry, "ts">): Promise<EvidenceEntry> {
  const entry: EvidenceEntry = { ts: Date.now(), ...e };
  const path = evidencePath();
  await mkdir(dirname(path), { recursive: true }).catch(() => {
    /* dirname(".") → no-op; ignore */
  });
  await appendFile(path, JSON.stringify(entry) + "\n");
  return entry;
}
