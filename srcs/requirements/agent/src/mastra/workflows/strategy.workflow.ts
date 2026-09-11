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
import { ledgerConfig } from "../../config/env.js";
import { actionHashOf, verifyLedgerApproval, type LedgerApproval } from "../../ledger/approval.js";

// carry the StrategySpec loosely through the workflow (validation already happened
// in compose()'s structuredOutput — this just routes the approved object).
const Spec = z.unknown();

// Workflow input = the NL intent + an OPTIONAL memory scope (resource=user, thread=session).
// When resource+thread are BOTH present, compose() recalls recent turns (short-term
// memory). Omit both for a stateless one-shot propose. (A1 — kills the "memory is dead
// code" finding: previously compose() was called with no scope, so recall never engaged.)
const WorkflowInput = z.object({
  nl: z.string(),
  resource: z.string().optional(),
  thread: z.string().optional(),
});

// Step 1 — NL → StrategySpec proposal (the AI draft), with optional memory recall.
const composeStep = createStep({
  id: "compose",
  inputSchema: WorkflowInput,
  outputSchema: z.object({ spec: Spec }),
  execute: async ({ inputData }) => {
    const scope =
      inputData.resource && inputData.thread
        ? { resource: inputData.resource, thread: inputData.thread }
        : undefined;
    return { spec: await compose(inputData.nl, scope) };
  },
});

// Step 2 — HITL approve. First run: suspend with the proposal for /review.
// Resume: human decision (approved boolean). Returns the spec + decision; the
// gateAgent consumes approved=true to ship (or drops on false).
//
// Ledger Continuity (Fase 1ter): when LEDGER_GATE=on, approved=true also
// requires `ledger` — a fresh EIP-191 signature made on the hardware over a
// message embedding the proposal's actionHash (anti-replay across actions),
// verified against LEDGER_APPROVER_ADDRESS. An approval that fails the check
// degrades to approved=false with the reason in `detail` — the workflow never
// ships on a bare button click while the gate is on.
const approveStep = createStep({
  id: "approve",
  inputSchema: z.object({ spec: Spec }),
  outputSchema: z.object({ approved: z.boolean(), spec: Spec, detail: z.string().optional() }),
  suspendSchema: z.object({ spec: Spec, actionHash: z.string() }),
  resumeSchema: z.object({
    approved: z.boolean(),
    ledger: z
      .object({
        address: z.string(),
        message: z.string(),
        signature: z.string(),
      })
      .optional(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const actionHash = actionHashOf(inputData.spec);
    if (!resumeData) return suspend({ spec: inputData.spec, actionHash }); // park for human review
    if (resumeData.approved) {
      const cfg = ledgerConfig();
      if (cfg.gateOn) {
        const blank: LedgerApproval = { address: "", message: "", signature: "" };
        const check = await verifyLedgerApproval(resumeData.ledger ?? blank, {
          approverAddress: cfg.approverAddress,
          actionHash,
        });
        if (!check.ok) {
          return { approved: false, spec: inputData.spec, detail: `ledger approval rejected: ${check.error}` };
        }
      }
    }
    return { approved: resumeData.approved, spec: inputData.spec };
  },
});

export const strategyWorkflow = createWorkflow({
  id: "strategy-hitl",
  description: "NL → StrategySpec proposal → human approval (HITL).",
  inputSchema: WorkflowInput,
  outputSchema: z.object({ approved: z.boolean(), spec: Spec, detail: z.string().optional() }),
})
  .then(composeStep)
  .then(approveStep)
  .commit();
