// mcp__wave__* WRITE tools — ENS writes. AUTONOMOUS group (never HITL-gated), per AGENT.md
// authz: setText + registerSubname are ensAgent's, executed directly. No business logic —
// these wrap clients/ens.ts (setText) and ens/register.ts (registerStrategy). Spec:
// docs/strategy/AGENT.md §"Tool groups" (Writes — autonomous) + §"Authz matrix".
import { createTool } from "@mastra/core/tools";
import { z } from "zod/v4";
import { ens } from "../clients/ens.js";
import { ensWalletConfig, ensConfig } from "../ens/config.js";
import { registerStrategy } from "../ens/register.js";
import { deployStrategy } from "../actions/deployStrategy.js";

const Hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

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

/**
 * Claim a user-identity subname for a nameless wallet: mint `<label>.<parent>` (default
 * label derived from the wallet address) under the ENS writer key, then set the addr record
 * so the subname resolves back to the user. This gives follow (which writes a
 * `wave.following/<id>` record ON the follower's name) a home for wallets that own no ENS
 * name of their own. Autonomous — same authz as setText/registerSubname.
 *
 * Idempotent: setSubnodeRecord re-takes ownership to the writer key on an existing subnode
 * (the writer owns the parent), so re-claiming is safe and returns the same name.
 */
export const claimHandle = createTool({
  id: "claimHandle",
  description:
    "Mint a *.wave.eth identity subname for a wallet (auto-derived label) and set its addr " +
    "record. Used so nameless wallets can follow strategies. Autonomous — never HITL-gated.",
  inputSchema: z.object({
    address: Address,
    label: z.string().optional(),
  }),
  outputSchema: z.object({
    subname: z.string(),
    registerTxHash: z.string().optional(),
    setAddrTxHash: z.string().optional(),
  }),
  execute: async ({ address, label }) => {
    const { privateKey } = await ensWalletConfig();
    const parent = ensConfig().parentName;
    // Auto-derive a stable label from the address body when none supplied — the UI never
    // invents labels, so derivation lives here.
    const derived = label ?? (address as string).slice(2, 10).toLowerCase();
    const { subname, txHash: registerTxHash } = await ens.registerSubname({
      parent,
      label: derived,
      privateKey,
    });
    let setAddrTxHash: `0x${string}` | undefined;
    try {
      setAddrTxHash = await ens.setAddr({ name: subname, address: address as `0x${string}`, privateKey });
    } catch {
      // Mint succeeded — addr record is best-effort. Follow works without it; we still
      // return the subname so the caller can proceed.
    }
    return { subname, registerTxHash, setAddrTxHash };
  },
});

/**
 * Ship a strategy live: compile the spec → register ENS → announce on the router → approve
 * tokens → ship to Aqua → verify. The full README pipeline (L5→L1→L3), executed entirely in
 * the agent process. The UI's "Ship on-chain" button calls this with the finalized spec from
 * the compose agent — it forwards the SPEC, never client-supplied bytes or hashes (the agent
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
    "compile → ENS register → announce → approve → ship → verify. Returns strategyId, " +
    "programHash, subname, and tx hashes. Destructive — caller MUST hold explicit human approval.",
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
    subname: z.string(),
    announceTxHash: z.string().optional(),
    shipTxHash: z.string().optional(),
    registerTxHash: z.string().optional(),
    approved: z.boolean(),
    shipped: z.boolean(),
    alreadyDeployed: z.boolean().optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => deployStrategy(input),
});
