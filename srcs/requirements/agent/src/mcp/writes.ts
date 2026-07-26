// mcp__wave__* WRITE tools — ENS writes. AUTONOMOUS group (never HITL-gated), per AGENT.md
// authz: setText + registerSubname are ensAgent's, executed directly. No business logic —
// these wrap clients/ens.ts (setText) and ens/register.ts (registerStrategy). Spec:
// docs/strategy/AGENT.md §"Tool groups" (Writes — autonomous) + §"Authz matrix".
import { createTool } from "@mastra/core/tools";
import { z } from "zod/v4";
import { ens } from "../clients/ens.js";
import { ensWalletConfig } from "../ens/config.js";
import { registerStrategy } from "../ens/register.js";

const Hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

/** Write one ENS text record on a subname (the ENS writer key is read from env). */
export const setText = createTool({
  id: "setText",
  description:
    "Write an ENS text record on a strategy subname (ENS writer key). Autonomous — never HITL-gated.",
  inputSchema: z.object({ name: z.string(), key: z.string(), value: z.string() }),
  outputSchema: z.object({ txHash: z.string() }),
  execute: async ({ name, key, value }) => {
    const { privateKey } = await ensWalletConfig();
    return { txHash: await ens.setText({ name, key, value, privateKey }) };
  },
});

/** Register a strategy: mint the subname + write the ENSIP-25/26 record set. */
export const registerSubname = createTool({
  id: "registerSubname",
  description:
    "Register a strategy subname: mint it (ENS_REGISTRY) + write v0.programhash, description, " +
    "agent-context, agent-endpoint[mcp] (ENSIP-26), and agent-registration[…] (ENSIP-25). Autonomous.",
  inputSchema: z.object({
    label: z.string(),
    strategyId: Hex32,
    programHash: Hex32,
    description: z.string(),
    agentContext: z.string().optional(),
  }),
  outputSchema: z.object({
    subname: z.string(),
    records: z.array(z.object({ key: z.string(), value: z.string(), txHash: z.string().optional() })),
    registerTxHash: z.string().optional(),
    registerError: z.string().optional(),
  }),
  execute: async (input) =>
    registerStrategy({ ...input, programHash: input.programHash as `0x${string}` }),
});
