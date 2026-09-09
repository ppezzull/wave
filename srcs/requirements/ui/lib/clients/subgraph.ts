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
// ensNode/followerCount exist on the deployed v0.0.4 but are intentionally NOT
// queried: the ENS identity layer is gone and the upcoming ENS-free deploy
// drops the fields — never select what we don't use.
export interface SubgraphStrategy {
  id: string // bytes32 hex, lowercase 0x...
  programHash: string // bytes32
  status: StrategyStatus
  /** The post — StrategyDescribed payload, byte-for-byte compiler input. "" pre-event. */
  description: string
  cumulativeVolumeIn: string // BigInt wei string
  cumulativeVolumeOut: string // BigInt wei string
  /** Aqua Pushed − Pulled (C2 / PR #41). Present on v0.0.4+. */
  committedCapital: string
  swapCount: number
  lastSwapTimestamp: number // unix seconds (0 = never)
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

const SUBGRAPH_URL =
  process.env.WAVE_SUBGRAPH_URL ??
  'https://api.studio.thegraph.com/query/1756983/wave/v0.0.5'

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

// Studio v0.0.4 predates StrategyDescribed: selecting `description` against it fails the
// whole query. That's a KNOWN old-deploy signature, not a bug — the callers retry once
// with the legacy selection (no description) and map "" so behavior matches the old truth
// until the description-bearing deploy lands.
function isMissingDescriptionField(error: unknown): boolean {
  if (!(error instanceof ClientError)) return false
  const messages = (error.response?.errors ?? []).map((e) => e.message ?? '')
  return messages.some(
    (m) => /Cannot query field ["`]description["`] on type ["`]Strategy["`]/i.test(m),
  )
}

function normalizeId(id: string): string {
  return id.startsWith('0x') ? id.toLowerCase() : `0x${id}`.toLowerCase()
}

function coerceStatus(raw: string | null | undefined): StrategyStatus {
  return raw === 'stopped' || raw === 'removed' ? raw : 'active'
}

export const subgraph = {
  /** Production entity — empty while syncing / before any strategies seed. */
  async getStrategy(id: string): Promise<SubgraphStrategy | null> {
    const normalizedId = normalizeId(id)
    // v0.0.4 (pre-StrategyDescribed) rejects the `description` field — on that exact
    // error retry with the legacy selection and report "" (see isMissingDescriptionField).
    const fetchOne = async (withDescription: boolean) =>
      client.request<{
        strategy?: Omit<SubgraphStrategy, 'status' | 'description'> & {
          status?: string
          committedCapital?: string
          description?: string
        }
      }>(
        `query($id: ID!) {
          strategy(id: $id) {
            id programHash status${withDescription ? ' description' : ''}
            cumulativeVolumeIn cumulativeVolumeOut committedCapital
            swapCount lastSwapTimestamp
          }
        }`,
        { id: normalizedId },
      )
    const mapRow = (
      row: NonNullable<Awaited<ReturnType<typeof fetchOne>>['strategy']>,
    ): SubgraphStrategy => ({
      id: row.id,
      programHash: row.programHash,
      status: coerceStatus(row.status),
      description: row.description ?? '',
      cumulativeVolumeIn: row.cumulativeVolumeIn,
      cumulativeVolumeOut: row.cumulativeVolumeOut,
      committedCapital: row.committedCapital ?? '',
      swapCount: Number(row.swapCount),
      lastSwapTimestamp: Number(row.lastSwapTimestamp),
    })
    try {
      try {
        const data = await fetchOne(true)
        if (!data?.strategy) return null
        return mapRow(data.strategy)
      } catch (error) {
        if (!isMissingDescriptionField(error)) throw error
        const data = await fetchOne(false)
        if (!data?.strategy) return null
        return mapRow(data.strategy)
      }
    } catch (error) {
      if (isEntityNotDeployed(error)) return null
      throw error
    }
  },

  /** Production entity — empty while syncing / before any strategies seed. Newest-first by activity. */
  async listStrategies(first = 1000): Promise<SubgraphStrategy[]> {
    type Row = Omit<
      SubgraphStrategy,
      'swapCount' | 'lastSwapTimestamp' | 'status' | 'committedCapital' | 'description'
    > & {
      committedCapital?: string
      description?: string
      swapCount: string | number
      lastSwapTimestamp: string | number
      status?: string
    }
    const fetchList = (withDescription: boolean) =>
      client.request<{ strategies?: Row[] }>(
        `query($first: Int) {
          strategies(first: $first, orderBy: lastSwapTimestamp, orderDirection: desc) {
            id programHash status${withDescription ? ' description' : ''}
            cumulativeVolumeIn cumulativeVolumeOut committedCapital
            swapCount lastSwapTimestamp
          }
        }`,
        { first },
      )
    const toStrategy = (s: Row): SubgraphStrategy => ({
      id: s.id,
      programHash: s.programHash,
      status: coerceStatus(s.status),
      description: s.description ?? '',
      cumulativeVolumeIn: s.cumulativeVolumeIn,
      cumulativeVolumeOut: s.cumulativeVolumeOut,
      committedCapital: s.committedCapital ?? '',
      swapCount: Number(s.swapCount),
      lastSwapTimestamp: Number(s.lastSwapTimestamp),
    })
    try {
      try {
        const data = await fetchList(true)
        return (data?.strategies ?? []).map(toStrategy)
      } catch (error) {
        if (!isMissingDescriptionField(error)) throw error
        const data = await fetchList(false)
        return (data?.strategies ?? []).map(toStrategy)
      }
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
