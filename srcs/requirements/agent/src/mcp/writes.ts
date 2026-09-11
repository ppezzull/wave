// mcp__wave__* WRITE tools. ENS writes (setText/registerSubname/claimHandle) are gone with
// the ENS layer — identity is the trust seam's job now (ETHOnline continuity: replaces ENS,
// client-visible "verified human" distinction). What remains is the live ship arm and the
// testnet faucet.
import { createTool } from "@mastra/core/tools";
import { z } from "zod/v4";
import { deployStrategy, type DeployInput } from "../actions/deployStrategy.js";
import { faucetDrip as runFaucetDrip } from "../actions/faucet.js";

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
    "and tx hashes. With `author`, records on-chain authorship right after announce " +
    "(attributeTxHash). Destructive — caller MUST hold explicit human approval.",
  inputSchema: z.object({
    spec: z.object({
      specVersion: z.literal(1),
      pair: z.object({ token0: Address, token1: Address }),
      size: z.object({ amount0: DecimalStr, amount1: DecimalStr }),
      blocks: z.array(z.object({ type: z.string() }).catchall(z.unknown())).min(1),
    }),
    label: z.string().optional(),
    decimals: z.number().int().min(0).max(36).optional(),
    // The post — stored on-chain (StrategyDescribed) and round-tripped by the fork route.
    // Byte-for-byte the compiler input; never trimmed or reflowed.
    description: z.string().optional(),
    // The author's wallet (the UI session user). Triggers StrategyFactory.attribute right
    // after announce — best-effort; failure leaves attributeTxHash absent, ship stands.
    author: Address.optional(),
  // HITL approval (Ledger Continuity): required when LEDGER_GATE is session|device.
  approval: z
    .object({
      kind: z.enum(["device", "session"]),
      address: Address,
      message: z.string().min(1),
      signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
    })
    .optional(),
  }),
  outputSchema: z.object({
    // Absent when a pre-flight step (pair validation, decimals read) failed before compile.
    strategyId: z.string().optional(),
    programHash: z.string().optional(),
    handle: z.string().optional(),
    announceTxHash: z.string().optional(),
    // StrategyFactory.attribute tx (task #31) — only when author was given AND succeeded.
    attributeTxHash: z.string().optional(),
    shipTxHash: z.string().optional(),
    approved: z.boolean(),
    shipped: z.boolean(),
    alreadyDeployed: z.boolean().optional(),
    error: z.string().optional(),
  }),
  // `author` is zod-validated as 0x…40-hex here and re-validated pre-flight inside the
  // pipeline; the cast only bridges zod's `string` to viem's `0x${string}` brand.
  execute: async (input) => deployStrategy({ ...input, author: input.author as DeployInput["author"] }),
});

/**
 * Drip Sepolia ETH from the agent's faucet wallet to an address — the in-app "buffer
 * wallet" (PROD-TESTNET §4) behind the Settings "Get test ETH" button. Capped:
 * 0.05/drip, per-address 6h cooldown, empty-wallet gate, per-process budget. Returns
 * {ok:false, error} for every expected failure (config included) — never throws.
 *
 * Authz (event demo): moves server-wallet funds, so the UI MUST only invoke it from an
 * explicit user action (the button click itself is the gate — a capped testnet drip
 * needs no confirm dialog).
 */
export const faucetDrip = createTool({
  id: "faucetDrip",
  description:
    "Drip Sepolia ETH from the agent's faucet wallet to an address (the in-app buffer wallet, " +
    "PROD-TESTNET §4). Capped: 0.05/drip, per-address 6h cooldown, empty-wallet gate, per-process " +
    "budget. Moves server-wallet funds — caller must be an explicit user action.",
  inputSchema: z.object({
    address: Address,
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    txHash: z.string().optional(),
    dripped: z.string().optional(),
    faucetAddress: z.string().optional(),
    retryInSec: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ address }) => runFaucetDrip({ address }),
});
