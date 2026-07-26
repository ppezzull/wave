// mcp__wave__* READ tools. No business logic here — policy stays pure in
// src/policy/. All read-only (mcp.annotations.readOnlyHint). The clients
// (subgraph/aqua/router/ens) are stubs until Pietro's subgraph + Flaviano's
// router land; tools throw clearly until then, so no fake data reaches
// policy.decide().
//
// Spec: docs/strategy/AGENT.md §"The MCP tool surface" (Reads).
import { createTool } from "@mastra/core/tools";
import { z } from "zod/v4";
import { subgraph } from "../clients/subgraph.js";
import { ens } from "../clients/ens.js";
import { aqua } from "../clients/aqua.js";
import { router } from "../clients/router.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const Status = z.enum(["active", "stopped", "removed"]);

const StrategyOut = z.object({
  id: z.string(),
  programHash: z.string(),
  ensNode: z.string(),
  status: Status,
  // Ranking + retune inputs (R1 needs committedCapital). Mirrors clients/subgraph.ts Strategy.
  cumulativeVolumeIn: z.string(),
  cumulativeVolumeOut: z.string(),
  committedCapital: z.string(),
  swapCount: z.number(),
  lastSwapTimestamp: z.number(),
  followerCount: z.number(),
});

export const getStrategy = createTool({
  id: "getStrategy",
  description: "Read a strategy by id from the subgraph.",
  inputSchema: z.object({ id: z.string() }),
  outputSchema: StrategyOut,
  mcp: { annotations: READ_ONLY },
  execute: async ({ id }) => subgraph.getStrategy(id),
});

export const listStrategies = createTool({
  id: "listStrategies",
  description: "List strategies, optionally filtered by status (active|stopped|removed).",
  inputSchema: z.object({ status: Status.optional() }),
  outputSchema: z.object({ strategies: z.array(StrategyOut) }),
  mcp: { annotations: READ_ONLY },
  execute: async ({ status }) => ({ strategies: await subgraph.listStrategies(status) }),
});

export const getSwapHistory = createTool({
  id: "getSwapHistory",
  description: "Read recent swaps for a strategy (the cumulative volume that feeds R1).",
  inputSchema: z.object({ strategyId: z.string(), limit: z.number().int().min(1).max(500).default(50) }),
  outputSchema: z.object({
    swaps: z.array(z.object({ id: z.string(), strategyId: z.string(), amountIn: z.string(), amountOut: z.string(), timestamp: z.number() })),
  }),
  mcp: { annotations: READ_ONLY },
  execute: async ({ strategyId, limit }) => ({ swaps: await subgraph.getSwapHistory(strategyId, limit) }),
});

export const getOracleState = createTool({
  id: "getOracleState",
  description: "Read Chainlink oracle price + updatedAt for a feed (S3 staleness checks updatedAt).",
  inputSchema: z.object({ feed: z.string() }),
  outputSchema: z.object({ feed: z.string(), price: z.string(), updatedAt: z.number(), decimals: z.number() }),
  mcp: { annotations: READ_ONLY },
  execute: async ({ feed }) => aqua.getOracleState(feed),
});

export const getStrategyStatus = createTool({
  id: "getStrategyStatus",
  description: "Read a strategy's on-chain status (active|stopped|removed).",
  inputSchema: z.object({ strategyId: z.string() }),
  outputSchema: z.object({ status: Status }),
  mcp: { annotations: READ_ONLY },
  execute: async ({ strategyId }) => ({ status: await router.getStrategyStatus(strategyId) }),
});

export const getProgramHash = createTool({
  id: "getProgramHash",
  description: "Read the on-chain programHash for a strategy (the resolveVerify anchor).",
  inputSchema: z.object({ strategyId: z.string() }),
  outputSchema: z.object({ programHash: z.string() }),
  mcp: { annotations: READ_ONLY },
  execute: async ({ strategyId }) => ({ programHash: await router.getProgramHash(strategyId) }),
});

export const quote = createTool({
  id: "quote",
  description: "Read-only SwapVM quote (asView sim) — the safety card before ship.",
  inputSchema: z.object({ strategyId: z.string(), amountIn: z.string() }),
  outputSchema: z.object({ amountIn: z.string(), amountOut: z.string() }),
  mcp: { annotations: READ_ONLY },
  execute: async ({ strategyId, amountIn }) => aqua.quote(strategyId, amountIn),
});

export const resolveENS = createTool({
  id: "resolveENS",
  description: "Resolve an ENS name to its address.",
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ address: Address.nullable() }),
  mcp: { annotations: READ_ONLY },
  execute: async ({ name }) => ({ address: await ens.resolve(name) }),
});

export const getTextRecord = createTool({
  id: "getTextRecord",
  description: "Read an ENS text record (e.g. agent-context, v0.programhash).",
  inputSchema: z.object({ name: z.string(), key: z.string() }),
  outputSchema: z.object({ value: z.string().nullable() }),
  mcp: { annotations: READ_ONLY },
  execute: async ({ name, key }) => ({ value: await ens.getTextRecord(name, key) }),
});
