// Network registry — the Settings network selector's backbone. The ACTIVE
// network is a per-request choice (cookie `wave-network`, default sepolia):
// every read (feed, search, profiles, detail pages, swap history) resolves
// its subgraph + RPC from it, so switching networks switches the whole view.
// Writes are the honest exception: the AGENT signs on ONE chain per process
// (AGENT_NETWORK) — the ship action refuses when the selector disagrees
// instead of silently shipping somewhere you're not looking.
import 'server-only'
import { cookies } from 'next/headers'

export type NetworkId = 'local' | 'sepolia' | 'mainnet'

export interface NetworkConfig {
  id: NetworkId
  label: string
  chainId: number
  /** The Graph endpoint for this network's wave deployment. */
  subgraphUrl: string
  /** RPC for the few direct reads (token decimals on compile preview). */
  rpc: string
  status: 'live' | 'coming-soon'
  note?: string
}

export const NETWORK_COOKIE = 'wave-network'
export const DEFAULT_NETWORK: NetworkId = 'sepolia'

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  local: {
    id: 'local',
    label: 'Local (anvil fork)',
    chainId: 31337,
    subgraphUrl:
      process.env.LOCAL_SUBGRAPH_URL ?? 'http://127.0.0.1:8000/subgraphs/name/wave',
    rpc: process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8547',
    status: 'live',
    note: 'The dev fork stack (anvil :8546 + local graph-node :8000).',
  },
  sepolia: {
    id: 'sepolia',
    label: 'Sepolia (live)',
    chainId: 11155111,
    subgraphUrl:
      process.env.WAVE_SUBGRAPH_URL ??
      'https://api.studio.thegraph.com/query/1756983/wave/v0.0.8',
    rpc: process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
    status: 'live',
    // v0.0.8 = #29 router+factory redeploy (blocks 11689820/22) + ChatVault
    // (block 11691527, on-chain encrypted chat backups) + author avatars.
    // v0.0.7 predates the vault; v0.0.6 is an EMPTY deployment.
    note: 'The live deployment (router 0x041b…2d02, Studio v0.0.8).',
  },
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    chainId: 1,
    subgraphUrl: '',
    rpc: '',
    status: 'coming-soon',
    note: 'Unlocks after Sepolia is fully tested. Same code, env flip + verified feeds.',
  },
}

const IDS = Object.keys(NETWORKS) as NetworkId[]

/** Parse a cookie value into a network (unknown values fall back to default). */
export function parseNetworkId(value: string | undefined | null): NetworkId {
  return IDS.includes(value as NetworkId) ? (value as NetworkId) : DEFAULT_NETWORK
}

/** The active network for THIS request (cookie-selected; server-only). */
export async function currentNetwork(): Promise<NetworkConfig> {
  const jar = await cookies()
  return NETWORKS[parseNetworkId(jar.get(NETWORK_COOKIE)?.value)]
}

/** The cookie-selected network id for THIS request (server-only). */
export async function selectedNetworkId(): Promise<NetworkId> {
  const jar = await cookies()
  return parseNetworkId(jar.get(NETWORK_COOKIE)?.value)
}

/**
 * The selector's option list — one source for Settings AND the sidebar
 * switcher (structurally matches NetworkOption in network-selector.tsx).
 * The LOCAL option is only offered while the dev stack actually answers —
 * a dead anvil/graph-node in the options list is a trap, not a choice.
 */
export async function networkOptions() {
  const localAlive = await localStackDetected()
  return Object.values(NETWORKS)
    .filter((n) => n.id !== 'local' || localAlive)
    .map((n) => ({
      id: n.id,
      label: n.label,
      note: n.note ?? '',
      disabled: n.status !== 'live',
    }))
}

// Local-stack liveness: short-timeout probe of the local graph-node,
// cached for a minute so the two selectors don't pay the check per request.
let localAlive: boolean | null = null
let localCheckedAt = 0

async function localStackDetected(): Promise<boolean> {
  const now = Date.now()
  if (localAlive !== null && now - localCheckedAt < 60_000) return localAlive
  let alive = false
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 400)
    const res = await fetch(NETWORKS.local.subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    alive = res.ok
  } catch {
    alive = false
  }
  localAlive = alive
  localCheckedAt = now
  return alive
}
