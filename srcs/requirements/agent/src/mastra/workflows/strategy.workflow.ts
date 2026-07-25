// strategy-hitl workflow — Beat A → HITL: NL → compose (propose) → suspend for
// human review at /review → resume on Approve/Modify/Reject.
//
// This is the "AI proposes → human approves → ship" beat. compose is real; the
// post-approval SHIP lives in the (blocked) recompileAndShip action arm — on
// resume(approved) we return the approved spec, which the gateAgent would hand to
// ship. Durable via LibSQL storage (suspend/resume survives restarts).
//
// Spec: docs/strategy/AGENT.md (workflow + gateAgent).
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod/v4";
import { compose } from "../compose.agent.js";

// carry the StrategySpec loosely through the workflow (validation already happened
// in compose()'s structuredOutput — this just routes the approved object).
const Spec = z.unknown();

// Step 1 — NL → StrategySpec proposal (the AI draft).
const composeStep = createStep({
  id: "compose",
  inputSchema: z.object({ nl: z.string() }),
  outputSchema: z.object({ spec: Spec }),
  execute: async ({ inputData }) => ({ spec: await compose(inputData.nl) }),
});

// Step 2 — HITL approve. First run: suspend with the proposal for /review.
// Resume: human decision (approved boolean). Returns the spec + decision; the
// gateAgent consumes approved=true to ship (or drops on false).
const approveStep = createStep({
  id: "approve",
  inputSchema: z.object({ spec: Spec }),
  outputSchema: z.object({ approved: z.boolean(), spec: Spec }),
  suspendSchema: z.object({ spec: Spec }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) return suspend({ spec: inputData.spec }); // park for human review
    return { approved: resumeData.approved, spec: inputData.spec };
  },
});

export const strategyWorkflow = createWorkflow({
  id: "strategy-hitl",
  description: "NL → StrategySpec proposal → human approval (HITL).",
  inputSchema: z.object({ nl: z.string() }),
  outputSchema: z.object({ approved: z.boolean(), spec: Spec }),
})
  .then(composeStep)
  .then(approveStep)
  .commit();
