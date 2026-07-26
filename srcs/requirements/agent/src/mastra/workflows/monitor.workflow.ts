// monitor workflow — the monitor→policy→{retune|gate} loop (AGENT.md: "one Mastra
// Workflow wires monitor → {retune | gate}"). Each tick: graphDelta polls → policy.decide()
// → if retune: autonomous ship (stubbed, blocked on dock/ship); if stop/remove/askHuman:
// suspend for HITL at /review (gate executes post-approval). retune is ALWAYS autonomous
// + data-caused; the HITL set is disjoint (posture invariant, AGENT.md L5).
//
// Skeleton: uses the stub delta source (R1 → retune). Swap via setDeltaSource when the
// real subgraph lands. Spec: docs/strategy/AGENT.md (workflow + subagent routing).
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod/v4";
import { monitorTick, deltaSource } from "../../monitor/graphDelta.js";
import type { ActionType } from "../../policy/index.js";

const ActionZ = z.object({
  type: z.enum(["retune", "stop", "remove", "askHuman", "noop"]),
  reason: z.string(),
  trigger: z.string().optional(),
});

/**
 * Route an action: retune is autonomous (the Graph invariant — never HITL); noop idles;
 * stop/remove/askHuman gate at HITL. Exported for tests + the falsifiable invariants.
 */
export const classifyAction = (a: { type: ActionType }): "autonomous" | "hitl" | "noop" => {
  if (a.type === "retune") return "autonomous";
  if (a.type === "noop") return "noop";
  return "hitl"; // stop | remove | askHuman
};

// Step 1 — monitor: poll the delta source → decide → evidence.log → the verdict.
const monitorStep = createStep({
  id: "monitor",
  inputSchema: z.object({}),
  outputSchema: z.object({ action: ActionZ }),
  execute: async () => {
    const actions = await monitorTick(deltaSource());
    const action = actions[0] ?? { type: "noop", reason: "no delta" };
    return { action };
  },
});

// Step 2 — act: retune = autonomous (stub dock/ship); HITL set suspends for /review.
const actStep = createStep({
  id: "act",
  inputSchema: z.object({ action: ActionZ }),
  outputSchema: z.object({
    mode: z.enum(["autonomous", "hitl", "noop"]),
    action: ActionZ,
    approved: z.boolean().optional(),
  }),
  suspendSchema: z.object({ action: ActionZ }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const mode = classifyAction(inputData.action);
    if (mode === "autonomous" || mode === "noop") return { mode, action: inputData.action };
    if (!resumeData) return suspend({ action: inputData.action }); // park for /review
    return { mode, action: inputData.action, approved: resumeData.approved };
  },
});

export const monitorWorkflow = createWorkflow({
  id: "monitor-loop",
  description: "graphDelta → policy.decide → autonomous retune | HITL gate.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    mode: z.enum(["autonomous", "hitl", "noop"]),
    action: ActionZ,
    approved: z.boolean().optional(),
  }),
})
  .then(monitorStep)
  .then(actStep)
  .commit();
