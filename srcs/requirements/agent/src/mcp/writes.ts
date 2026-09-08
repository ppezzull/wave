// mcp__wave__* WRITE tools. ENS writes (setText/registerSubname/claimHandle) are gone with
// the ENS layer — identity is World AgentKit's job now (ETHOnline continuity: replaces ENS,
// client-visible "verified human" distinction). What remains is the live ship arm.
import { createTool } from "@mastra/core/tools";
import { z } from "zod/v4";
import { deployStrategy } from "../actions/deployStrategy.js";

const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

/**
 * Ship a strategy live: compile the spec → announce on the router → approve tokens → ship
 * to Aqua → verify. The full README pipeline (L5→L1→L3), executed entirely in the agent
 * process. The UI's "Ship on-chain" button calls this with the finalized spec from the
 * compose agent — it forwards the SPEC, never client-supplied bytes or hashes (the agent
 * re-derives everything, so nothing the browser sends can misreport the on-chain program).
 *
 * Authz (event demo): the agent signs with server-side .env keys. Destructive by nature —
 * the UI MUST gate this behind an explicit human approval (the Ship confirm) before invoking.
 * Post-event hardening: user-wallet (Privy) signing replaces the server key.
 */
const DecimalStr = z
  .string()
  .min(1)
  .regex(/^\d+(\.\d+)?$/);

export const shipStrategy = createTool({
  id: "shipStrategy",
  description:
    "Compile a StrategySpec to SwapVM bytecode and ship a live strategy on Aqua (Sepolia): " +
    "compile → announce → approve → ship → verify. Returns strategyId, programHash, handle, " +
    "and tx hashes. Destructive — caller MUST hold explicit human approval.",
  inputSchema: z.object({
    spec: z.object({
      specVersion: z.literal(1),
      pair: z.object({ token0: Address, token1: Address }),
      size: z.object({ amount0: DecimalStr, amount1: DecimalStr }),
      blocks: z.array(z.object({ type: z.string() }).catchall(z.unknown())).min(1),
    }),
    label: z.string().optional(),
    decimals: z.number().int().min(0).max(36).optional(),
  }),
  outputSchema: z.object({
    strategyId: z.string(),
    programHash: z.string(),
    handle: z.string(),
    announceTxHash: z.string().optional(),
    shipTxHash: z.string().optional(),
    approved: z.boolean(),
    shipped: z.boolean(),
    alreadyDeployed: z.boolean().optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => deployStrategy(input),
});
