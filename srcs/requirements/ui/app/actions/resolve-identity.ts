'use server'

// resolveEnsName — address → ENS name, with a forward fallback.
//
// The follow path (app/actions/follow.ts) writes a `wave.following/<strategyId>`
// record ON the follower's ENS name, so it needs the name itself — not just the
// address. useSessionUser used to get that name via a client-side reverse lookup
// only (getEnsName), which returns null unless the wallet set a *reverse record*.
// Most wallets that *own* a .eth name never set one, so they were blocked from
// following despite having a real on-chain identity.
//
// This server action keeps the reverse lookup and adds a forward fallback: if
// reverse misses, ask the ENS subgraph for any 2LD the address owns. ENS RPC
// stays server-side (frontend.md §8); the browser only sees the resolved string.
//
// Never fabricates: when WAVE_ENS_WIRED !== 'true', or both lookups miss/error,
// returns null — same discipline as lib/clients/ens.ts and lib/clients/subgraph.ts.
import 'server-only'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { GraphQLClient, ClientError } from 'graphql-request'

const ENS_WIRED = process.env.WAVE_ENS_WIRED === 'true'

const AGENT_URL = process.env.AGENT_URL ?? 'http://agent:3002'

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ??
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ??
  'https://ethereum-sepolia-rpc.publicnode.com'

// Public ENS subgraph on Sepolia. The official deployment lives on The Graph's
// decentralized gateway and needs an API key; set GRAPH_API_KEY (or override the
// whole URL via ENS_SUBGRAPH_URL, e.g. a self-hosted Studio deployment). When no
// key is configured, the forward-lookup fallback no-ops (returns null) — nameless
// wallets then route through claimHandle, which still works.
const ENS_SEPOLIA_SUBGRAPH_ID = 'DmMXLtMZnGbQXASJ7p1jfzLUbBYnYUD9zNBTxpkjHYXV'
const ENS_SUBGRAPH_URL =
  process.env.ENS_SUBGRAPH_URL ??
  (process.env.GRAPH_API_KEY
    ? `https://gateway.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/${ENS_SEPOLIA_SUBGRAPH_ID}`
    : '') // empty => forward-lookup disabled until an endpoint is configured

let client: ReturnType<typeof createPublicClient> | null = null
function publicClient() {
  if (!client) {
    client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
  }
  return client
}

/**
 * Resolve an address to an ENS name. Reverse record first; if absent, fall back
 * to any 2LD the address owns (oldest registration wins, as a stable pick).
 * Returns null when not wired or when no name can be resolved. Never throws.
 */
export async function resolveEnsName(address: string): Promise<string | null> {
  if (!ENS_WIRED || !address) return null

  // 1. Reverse lookup (preserves prior behavior).
  try {
    const name = await publicClient().getEnsName({
      address: address as `0x${string}`,
    })
    if (name) return name
  } catch {
    /* fall through to forward lookup */
  }

  // 2. Forward fallback: a 2LD the address owns. Catches the common
  //    "owns a name, never set a reverse record" case. Skipped when no ENS
  //    subgraph endpoint is configured (nameless wallets route to claimHandle).
  if (!ENS_SUBGRAPH_URL) return null
  try {
    const gql = new GraphQLClient(ENS_SUBGRAPH_URL)
    const data = await gql.request<{
      domains?: Array<{ name?: string | null; labelName?: string | null }>
    }>(
      `query OwnedName($address: String!) {
        domains(where: { owner: $address, parent: "0x91d1777781884d03a6757a803996e69de2a9a737d45442bf1d3ff26e3d3a7b4f" }, first: 1, orderBy: registrationDate, orderDirection: asc) {
          name
          labelName
        }
      }`,
      { address: address.toLowerCase() },
    )
    const d = data.domains?.[0]
    // `name` is the full "foo.eth"; fall back to reconstructing from labelName.
    const name = d?.name ?? (d?.labelName ? `${d.labelName}.eth` : null)
    return name ?? null
  } catch (err) {
    // Swallow only network/subgraph errors (entity-not-deployed etc.) — empty
    // is the truth, never a fabricated name.
    if (err instanceof ClientError) return null
    return null
  }
}

/**
 * Claim a `*.wave.eth` identity subname for a nameless wallet by proxying the agent's
 * claimHandle tool (it holds the ENS writer key). The agent mints `<addr8>.wave.eth` under
 * the parent it owns and sets the addr record, returning the subname. Follow then has a name
 * to write its `wave.following/<id>` record on.
 *
 * Returns the minted subname on success, or null on any failure / when not wired — never
 * fabricates a name. Idempotent: re-claiming an existing subname is safe.
 */
export async function claimHandle(address: string): Promise<string | null> {
  if (!ENS_WIRED || !address) return null
  try {
    const res = await fetch(`${AGENT_URL}/api/tools/claimHandle/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { address } }),
      signal: AbortSignal.timeout(12000), // mint + setAddr = two txs
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      subname?: string
      result?: { subname?: string }
    }
    const subname = json.subname ?? json.result?.subname
    return subname ?? null
  } catch {
    return null
  }
}
