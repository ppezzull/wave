// onChainHash — read the LIVE on-chain programHash for a strategy from the deployed router's
// StrategyDeployed event. This is the on-chain source of truth that resolveVerifyLive compares
// the ENS `v0.programhash` record against, closing the G1 hash-chain live (not just on a fixture):
//   compiler keccak256(program)  ==  ENS v0.programhash record  ==  StrategyDeployed.programHash
// The event is emitted by the router's `announceStrategy()`. On `main` (#37/#40) programHash is
// keccak256(program) — derived on-chain from the announced order's program. ⚠️ The DEPLOYED Sepolia
// router (0xeb513fd1…) is still the #20 placeholder: announceStrategy(bytes32,bytes32) emits
// programHash=bytes32(0) and carries NO (Order,ensNode) selector — it MUST be redeployed from main
// before a real hash can be read (verified by bytecode selector scan 2026-07-26). Until then this
// reads 0 (or throws if announce was never called) → resolveVerifyLive aborts, which is the
// correct failure until a redeploy + an announce land.
// Spec: docs/strategy/ENS-PATH.md §7 (resolveVerify step 3 — read programHash from the event).
//
// The publicClient is injectable so the fetcher + resolveVerifyLive are unit-testable OFFLINE
// (no network, no key): the tests pass a stub client whose getLogs returns canned events.
import { parseAbiItem, type Address, type Hash, type PublicClient } from "viem";
import { publicClient } from "./clients.js";
import { ensConfig } from "./config.js";

/** The StrategyDeployed event — FROZEN team contract (EnsStrategyRouter.sol). */
export const STRATEGY_DEPLOYED = parseAbiItem(
  "event StrategyDeployed(bytes32 indexed strategyId, bytes32 programHash, bytes32 indexed ensNode)",
);

/** A read-only viem client (publicClient by default; a stub in tests). */
export type OnChainReadClient = Pick<PublicClient, "getLogs" | "getBlockNumber">;

export interface FetchOnChainHashOpts {
  /** Injectable client (defaults to the sepolia publicClient). Tests pass a stub. */
  client?: OnChainReadClient;
  /** Injectable router address (defaults to ensConfig().strategyRouter). Tests pass a stub. */
  router?: Address;
  /** Explicit start block — pass the announce block when known to skip the head lookup. */
  fromBlock?: bigint;
  /** End block (defaults to "latest"). */
  toBlock?: bigint;
}

/**
 * Default search window. 10k, not 50k: drpc — the endpoint the env contract
 * recommends — rejects wider ranges on its free plan with
 * `code: 35 "ranges over 10000 blocks are not supported"`. The old 50k default
 * meant every caller that omitted `fromBlock` (all of them, including the
 * resolveVerifyLive smoke) hit that on the G1 path.
 *
 * Pass `fromBlock` near the announce block when the strategy is older than 10k
 * blocks (~1.5 days on Sepolia) — the window is a fallback, not a search.
 */
const DEFAULT_WINDOW_BLOCKS = 10_000n;

/**
 * The most recent programHash emitted by `StrategyDeployed` for `strategyId`, or throws.
 * getLogs is filtered by the indexed strategyId (topic1), so the match is exact.
 *
 * Default window = last 50k blocks (public-RPC-safe). For an announce older than the window
 * (e.g. a strategy seeded long before the settle), pass an explicit `fromBlock` + an
 * archive-capable RPC. announceStrategy() MUST have been called first or this throws.
 */
export async function fetchOnChainProgramHash(
  strategyId: Hash,
  opts: FetchOnChainHashOpts = {},
): Promise<Hash> {
  const client = opts.client ?? publicClient();
  const router = opts.router ?? ensConfig().strategyRouter;

  let fromBlock = opts.fromBlock;
  if (fromBlock === undefined) {
    const head = await client.getBlockNumber();
    fromBlock = head > DEFAULT_WINDOW_BLOCKS ? head - DEFAULT_WINDOW_BLOCKS : 0n;
  }

  const logs = (await client.getLogs({
    address: router,
    event: STRATEGY_DEPLOYED,
    args: { strategyId },
    fromBlock,
    toBlock: opts.toBlock ?? "latest",
  })) as Array<{ blockNumber: bigint; args: { programHash: Hash } }>;

  if (!logs || logs.length === 0) {
    throw new Error(
      `[onChainHash] no StrategyDeployed event for strategyId ${strategyId} on router ${router} ` +
        `(searched from block ${fromBlock}). announceStrategy() must be called on-chain first.`,
    );
  }
  // viem returns logs block-ascending; the last is the most recent announcement for this id.
  return logs[logs.length - 1]!.args.programHash;
}
