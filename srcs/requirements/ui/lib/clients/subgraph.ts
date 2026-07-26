// The Graph subgraph client — server-side only.
//
// Mirrors the discipline of srcs/requirements/agent/src/clients/subgraph.ts
// (never fabricate; swallow ONLY "entity not deployed yet" GraphQL errors and
// return empty/not-found so the UI sees the real "no data yet" truth), but
// queries the FULL Strategy entity the agent's client omits (the ranking
// aggregates the feed needs).
//
// Endpoint: Studio `wave` **v0.0.4** (issue #51) — live Sepolia data verified
// (strategy 0xcbbd… + swap + committedCapital). Alias `…/version/latest` resolves
// here too. v0.0.2/v0.0.3 are historical (pre-#49 router redeploy).
import 'server-only'
import { GraphQLClient, ClientError } from 'graphql-request'

export type StrategyStatus = 'active' | 'stopped' | 'removed'

// Full production Strategy shape (srcs/requirements/subgraph/schema.graphql).
export interface SubgraphStrategy {
  id: string // bytes32 hex, lowercase 0x...
  programHash: string // bytes32
  ensNode: string // bytes32 namehash hex
  status: StrategyStatus
  cumulativeVolumeIn: string // BigInt wei string
  cumulativeVolumeOut: string // BigInt wei string
  /** Aqua Pushed − Pulled (C2 / PR #41). Present on v0.0.4+. */
  committedCapital: string
  swapCount: number
  lastSwapTimestamp: number // unix seconds (0 = never)
  followerCount: number
}

export interface SubgraphSwap {
  id: string
  strategyId: string
  maker: string
  taker: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOut: string
  timestamp: number
  blockNumber: number
  transactionHash: string
}

// The production Follow entity (srcs/requirements/subgraph/schema.graphql): one row per
// TextChanged event on a `wave.following/<strategyId>` key. isFollowing flips
// false on a clear (value==""). node is the follower's ENS namehash;
// strategyKey is the full "wave.following/<id>" key (Pietro.md names this field).
export interface Follow {
  id: string
  node: string // ENS namehash of the follower's name
  strategyKey: string // "wave.following/<strategyId>"
  isFollowing: boolean
  timestamp: number // unix seconds
}

const SUBGRAPH_URL =
  process.env.WAVE_SUBGRAPH_URL ??
  'https://api.studio.thegraph.com/query/1756983/wave/v0.0.4'

const headers: Record<string, string> | undefined = process.env.WAVE_SUBGRAPH_KEY
  ? { Authorization: `Bearer ${process.env.WAVE_SUBGRAPH_KEY}` }
  : undefined

const client = new GraphQLClient(SUBGRAPH_URL, headers ? { headers } : undefined)

// The deployed subgraph may be the SPIKE — querying a production entity
// (`strategies`/`swaps`) that doesn't exist on it returns a GraphQL error.
// We swallow ONLY those "entity not deployed yet" errors and return empty /
// not-found, so the UI sees real "no data yet" instead of a crash.
//
// Narrow detection (copied from the agent client): a production subgraph with a
// real bug ALSO returns errors[], and those MUST propagate — swallowing them as
// "no data" would mask a broken subgraph as an empty one. Match the two specific
// not-deployed signatures, not "any error".
function isEntityNotDeployed(error: unknown): boolean {
  if (!(error instanceof ClientError)) return false
  const messages = (error.response?.errors ?? []).map((e) => e.message ?? '')
  return messages.some(
    (m) => /Type `Query` has no field/i.test(m) || /must have an input type/i.test(m),
  )
}

function normalizeId(id: string): string {
  return id.startsWith('0x') ? id.toLowerCase() : `0x${id}`.toLowerCase()
}

function coerceStatus(raw: string | null | undefined): StrategyStatus {
  return raw === 'stopped' || raw === 'removed' ? raw : 'active'
}

export const subgraph = {
  /** Production Follow entity (v0.0.4). Lists `wave.following/<id>` TextChanged
   * events — the follow graph. Empty until follows happen.
   */
  async listFollows(first = 1000): Promise<Follow[]> {
    try {
      const data = await client.request<{
        follows?: Array<{
          id: string
          node: string
          strategyKey: string
          isFollowing: boolean
          timestamp: string | number
        }>
      }>(
        `query($first: Int) {
          follows(first: $first, where: { strategyKey_starts_with: "wave.following/" }, orderBy: timestamp, orderDirection: desc) {
            id node strategyKey isFollowing timestamp
          }
        }`,
        { first },
      )
      return (data.follows ?? []).map((r) => ({
        id: r.id,
        node: r.node,
        strategyKey: r.strategyKey,
        isFollowing: r.isFollowing,
        timestamp: Number(r.timestamp),
      }))
    } catch (error) {
      if (isEntityNotDeployed(error)) return []
      throw error
    }
  },

  /** Production entity — empty while syncing / before any strategies seed. */
  async getStrategy(id: string): Promise<SubgraphStrategy | null> {
    const normalizedId = normalizeId(id)
    try {
      const data = await client.request<{
        strategy?: Omit<SubgraphStrategy, 'status'> & { status?: string; committedCapital?: string }
      }>(
        `query($id: ID!) {
          strategy(id: $id) {
            id programHash ensNode status
            cumulativeVolumeIn cumulativeVolumeOut committedCapital
            swapCount lastSwapTimestamp followerCount
          }
        }`,
        { id: normalizedId },
      )
      if (!data?.strategy) return null
      return {
        id: data.strategy.id,
        programHash: data.strategy.programHash,
        ensNode: data.strategy.ensNode,
        status: coerceStatus(data.strategy.status),
        cumulativeVolumeIn: data.strategy.cumulativeVolumeIn,
        cumulativeVolumeOut: data.strategy.cumulativeVolumeOut,
        committedCapital: data.strategy.committedCapital ?? '',
        swapCount: Number(data.strategy.swapCount),
        lastSwapTimestamp: Number(data.strategy.lastSwapTimestamp),
        followerCount: Number(data.strategy.followerCount),
      }
    } catch (error) {
      if (isEntityNotDeployed(error)) return null
      throw error
    }
  },

  /** Production entity — empty while syncing / before any strategies seed. Newest-first by activity. */
  async listStrategies(first = 1000): Promise<SubgraphStrategy[]> {
    try {
      const data = await client.request<{
        strategies?: Array<
          Omit<
            SubgraphStrategy,
            'swapCount' | 'lastSwapTimestamp' | 'followerCount' | 'status' | 'committedCapital'
          > & {
            committedCapital?: string
            swapCount: string | number
            lastSwapTimestamp: string | number
            followerCount: string | number
            status?: string
          }
        >
      }>(
        `query($first: Int) {
          strategies(first: $first, orderBy: lastSwapTimestamp, orderDirection: desc) {
            id programHash ensNode status
            cumulativeVolumeIn cumulativeVolumeOut committedCapital
            swapCount lastSwapTimestamp followerCount
          }
        }`,
        { first },
      )
      return (data?.strategies ?? []).map((s) => ({
        id: s.id,
        programHash: s.programHash,
        ensNode: s.ensNode,
        status: coerceStatus(s.status),
        cumulativeVolumeIn: s.cumulativeVolumeIn,
        cumulativeVolumeOut: s.cumulativeVolumeOut,
        committedCapital: s.committedCapital ?? '',
        swapCount: Number(s.swapCount),
        lastSwapTimestamp: Number(s.lastSwapTimestamp),
        followerCount: Number(s.followerCount),
      }))
    } catch (error) {
      if (isEntityNotDeployed(error)) return []
      // Build-time / transient network: empty is the truth, never crash the UI.
      console.warn('[subgraph.listStrategies]', error)
      return []
    }
  },

  /** Production entity — swap history for the detail page. Empty while syncing. */
  async getSwapHistory(strategyId: string, limit = 50): Promise<SubgraphSwap[]> {
    const normalizedId = normalizeId(strategyId)
    try {
      const data = await client.request<{
        swaps?: Array<Omit<SubgraphSwap, 'timestamp' | 'blockNumber'> & {
          timestamp: string | number
          blockNumber: string | number
        }>
      }>(
        `query($strategyId: ID!, $first: Int) {
          swaps(first: $first, where: { strategy: $strategyId }, orderBy: timestamp, orderDirection: desc) {
            id strategy amountIn amountOut timestamp
          }
        }`,
        { strategyId: normalizedId, first: Math.min(limit, 1000) },
      )
      return (data.swaps ?? []).map((s) => ({
        id: s.id,
        strategyId: (s as { strategy?: string }).strategy ?? normalizedId,
        maker: (s as { maker?: string }).maker ?? '',
        taker: (s as { taker?: string }).taker ?? '',
        tokenIn: (s as { tokenIn?: string }).tokenIn ?? '',
        tokenOut: (s as { tokenOut?: string }).tokenOut ?? '',
        amountIn: s.amountIn,
        amountOut: s.amountOut,
        timestamp: Number(s.timestamp),
        blockNumber: Number(s.blockNumber),
        transactionHash: (s as { transactionHash?: string }).transactionHash ?? '',
      }))
    } catch (error) {
      if (isEntityNotDeployed(error)) return []
      throw error
    }
  },
}
