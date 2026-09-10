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
  /** On-chain authorship — StrategyFactory.StrategyAttributed (task #31). ZERO_ADDRESS
   *  sentinel = unattributed (shipped before the factory existed / no session wallet).
   *  Profiles and /chat threads key on it. */
  author: string
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

// Studio v0.0.4 predates StrategyDescribed AND the live v0.0.5 predates the author field
// (task #31, lands with v0.0.6): selecting either against those deploys fails the whole
// query. That's a KNOWN old-deploy signature, not a bug — withOptionalStrategyFields
// retries dropping the offending field (max 2) and the row mapper fills the documented
// legacy value ("" description / ZERO_ADDRESS author) so behavior matches the old truth.
type OptionalStrategyField = 'description' | 'author'

function parseMissingStrategyField(error: unknown): OptionalStrategyField | null {
  if (!(error instanceof ClientError)) return null
  const messages = (error.response?.errors ?? []).map((e) => e.message ?? '')
  for (const m of messages) {
    const match = m.match(
      /Cannot query field ["`](description|author)["`] on type ["`]Strategy["`]/i,
    )
    if (match) return match[1].toLowerCase() as OptionalStrategyField
  }
  return null
}

/** Selection fragment for the fields a deploy may predate. */
function optionalFields(fields: OptionalStrategyField[]): string {
  return fields.map((f) => ` ${f}`).join('')
}

/** Run a Strategy query, retrying (max 2) with the offending optional field dropped when
 *  the pinned deploy errors "Cannot query field … on type Strategy". Other errors throw. */
async function withOptionalStrategyFields<R>(
  fetcher: (fields: OptionalStrategyField[]) => Promise<R>,
): Promise<R> {
  const fields: OptionalStrategyField[] = ['description', 'author']
  for (let retries = 0; ; retries++) {
    try {
      return await fetcher(fields)
    } catch (error) {
      const missing = parseMissingStrategyField(error)
      if (!missing || retries >= 2 || !fields.includes(missing)) throw error
      fields.splice(fields.indexOf(missing), 1)
    }
  }
}

// The subgraph's "unattributed" sentinel (mapping.ts ZERO_ADDRESS) — lowercase to match
// graph-node's Bytes serialization so comparisons stay case-safe.
const ZERO_AUTHOR = '0x0000000000000000000000000000000000000000'

function normalizeId(id: string): string {
  return id.startsWith('0x') ? id.toLowerCase() : `0x${id}`.toLowerCase()
}

/** Strategy ids are 32-byte hex. Anything else (e.g. a handle like "s-e52db455") is not
 *  addressable — return "not found" rather than letting graph-node choke on the coerced id. */
function isStrategyId(id: string): boolean {
  return /^0x[0-9a-f]{64}$/.test(normalizeId(id))
}

function coerceStatus(raw: string | null | undefined): StrategyStatus {
  return raw === 'stopped' || raw === 'removed' ? raw : 'active'
}

/** Raw GraphQL row — fields a deploy may predate arrive optional (see
 *  withOptionalStrategyFields); counts/timestamps arrive as string or number. */
type StrategyRow = Omit<
  SubgraphStrategy,
  'status' | 'description' | 'author' | 'committedCapital' | 'swapCount' | 'lastSwapTimestamp'
> & {
  status?: string
  description?: string
  author?: string
  committedCapital?: string
  swapCount: string | number
  lastSwapTimestamp: string | number
}

const toStrategy = (row: StrategyRow): SubgraphStrategy => ({
  id: row.id,
  programHash: row.programHash,
  status: coerceStatus(row.status),
  description: row.description ?? '',
  author: (row.author ?? ZERO_AUTHOR).toLowerCase(),
  cumulativeVolumeIn: row.cumulativeVolumeIn,
  cumulativeVolumeOut: row.cumulativeVolumeOut,
  committedCapital: row.committedCapital ?? '',
  swapCount: Number(row.swapCount),
  lastSwapTimestamp: Number(row.lastSwapTimestamp),
})

export const subgraph = {
  /** Production entity — empty while syncing / before any strategies seed. */
  async getStrategy(id: string): Promise<SubgraphStrategy | null> {
    if (!isStrategyId(id)) return null
    const normalizedId = normalizeId(id)
    const fetchOne = (fields: OptionalStrategyField[]) =>
      client.request<{ strategy?: StrategyRow }>(
        `query($id: ID!) {
          strategy(id: $id) {
            id programHash status${optionalFields(fields)}
            cumulativeVolumeIn cumulativeVolumeOut committedCapital
            swapCount lastSwapTimestamp
          }
        }`,
        { id: normalizedId },
      )
    try {
      const data = await withOptionalStrategyFields(fetchOne)
      if (!data?.strategy) return null
      return toStrategy(data.strategy)
    } catch (error) {
      if (isEntityNotDeployed(error)) return null
      throw error
    }
  },

  /** Production entity — empty while syncing / before any strategies seed. Newest-first by activity. */
  async listStrategies(first = 1000): Promise<SubgraphStrategy[]> {
    const fetchList = (fields: OptionalStrategyField[]) =>
      client.request<{ strategies?: StrategyRow[] }>(
        `query($first: Int) {
          strategies(first: $first, orderBy: lastSwapTimestamp, orderDirection: desc) {
            id programHash status${optionalFields(fields)}
            cumulativeVolumeIn cumulativeVolumeOut committedCapital
            swapCount lastSwapTimestamp
          }
        }`,
        { first },
      )
    try {
      const data = await withOptionalStrategyFields(fetchList)
      return (data?.strategies ?? []).map(toStrategy)
    } catch (error) {
      if (isEntityNotDeployed(error)) return []
      // Build-time / transient network: empty is the truth, never crash the UI.
      console.warn('[subgraph.listStrategies]', error)
      return []
    }
  },

  /** Author-keyed strategies — the /u/<address> profile and /chat thread list (task #31).
   *  Pre-factory deploys never carry authorship, so nothing matches a real wallet — [] is
   *  the honest truth, same as unattributed. Newest-first by activity. */
  async listStrategiesByAuthor(author: string, first = 1000): Promise<SubgraphStrategy[]> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(author)) return []
    const fetchByAuthor = (fields: OptionalStrategyField[]) =>
      client.request<{ strategies?: StrategyRow[] }>(
        `query($author: Bytes!, $first: Int) {
          strategies(first: $first, where: { author: $author }, orderBy: lastSwapTimestamp, orderDirection: desc) {
            id programHash status${optionalFields(fields)}
            cumulativeVolumeIn cumulativeVolumeOut committedCapital
            swapCount lastSwapTimestamp
          }
        }`,
        { author: author.toLowerCase(), first },
      )
    try {
      const data = await withOptionalStrategyFields(fetchByAuthor)
      return (data?.strategies ?? []).map(toStrategy)
    } catch (error) {
      if (isEntityNotDeployed(error)) return []
      // A pre-author deploy also rejects the `where: {author:…}` FILTER — that error names
      // Strategy_filter, not Strategy, so the selection retry above correctly declines it
      // and it lands here. No authorships exist there: [] is the truth. Never crash the UI.
      console.warn('[subgraph.listStrategiesByAuthor]', error)
      return []
    }
  },

  /** Production entity — swap history for the detail page. Empty while syncing. */
  async getSwapHistory(strategyId: string, limit = 50): Promise<SubgraphSwap[]> {
    if (!isStrategyId(strategyId)) return []
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
