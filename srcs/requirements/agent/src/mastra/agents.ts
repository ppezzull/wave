// The 4 agent scaffolds (compose lives in compose.agent.ts). PLACEHOLDERS — their real
// work is the monitor workflow (decide → retune|gate) + the action tools (dock/ship, ENS,
// stop/remove), which land as teammates unblock. Registered so Studio shows the full
// 5-agent roster (the "completo" story) and so the workflow can name them. Spec:
// docs/strategy/AGENT.md (Subagent decomposition).
import { Agent } from "@mastra/core/agent";
import { gemmaModel } from "./llm.js";

/** Polls the subgraph, runs policy.decide() each tick. DECIDES only — executes no writes. */
export const monitorAgent = new Agent({
  id: "monitor",
  name: "wave monitor agent",
  instructions:
    "You poll the subgraph for strategy deltas and run policy.decide() each tick. You DECIDE only (retune | stop | remove | askHuman) — you execute no writes. Pure policy, no invention.",
  model: gemmaModel(),
});

/** Executes the autonomous retune: dock() → recompile → ship(). Never HITL-gated. */
export const retuneAgent = new Agent({
  id: "retune",
  name: "wave retune agent",
  instructions:
    "You execute the autonomous retune: dock() → recompile → ship(). Never HITL-gated (the Graph invariant). Cite the Swapped entity id that caused the retune in the evidence log.",
  model: gemmaModel(),
});

/** Resolves + verifies ENS (hash-verify before settle); writes v0.programhash / registers. */
export const ensAgent = new Agent({
  id: "ens",
  name: "wave ens agent",
  instructions:
    "You resolve + verify ENS (hash-verify before settle) and write text records (v0.programhash) / register subnames. Abort on any hash mismatch.",
  model: gemmaModel(),
});

/** Owns the HITL queue — executes stop/remove/changeOracleBand ONLY post-approval. */
export const gateAgent = new Agent({
  id: "gate",
  name: "wave gate agent",
  instructions:
    "You own the HITL queue. You execute stop/remove/changeOracleBand ONLY after human approval at /review. Reads are blank for you; you act post-approval.",
  model: gemmaModel(),
});
