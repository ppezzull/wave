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

/**
 * Per-action severity for surfacing ONE verdict per tick when monitorTick returns many
 * (one per strategy). HITL actions preempt a retune; within HITL, stop > remove > askHuman
 * mirrors the policy precedence (S3/S1 > M1 > E*). Without this, `actions[0]` silently
 * drops an urgent stop behind a benign retune on a multi-strategy tick.
 */
export const severityRank: Record<ActionType, number> = {
  noop: 0,
  retune: 1,
  askHuman: 2,
  remove: 3,
  stop: 4,
};

// Step 1 — monitor: poll the delta source → decide → evidence.log → the verdict.
const monitorStep = createStep({
  id: "monitor",
  inputSchema: z.object({}),
  outputSchema: z.object({ action: ActionZ }),
  execute: async () => {
    const actions = await monitorTick(deltaSource());
    if (actions.length === 0) return { action: { type: "noop" as const, reason: "no delta" } };
    // Surface the most severe verdict (HITL preempts retune); log the deferred ones so a
    // multi-strategy tick never silently drops an urgent stop behind a benign retune.
    const ordered = [...actions].sort((a, b) => severityRank[b.type] - severityRank[a.type]);
    const action = ordered[0]!; // ordered is non-empty (early-return above)
    const deferred = ordered.slice(1);
    if (deferred.length > 0) {
      console.warn(
        `[monitor] ${deferred.length} action(s) deferred this tick: ` +
          deferred.map((d) => `${d.type} — ${d.reason}`).join(" | "),
      );
    }
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
