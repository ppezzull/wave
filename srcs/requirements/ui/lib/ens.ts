// Reverse ENS resolution — the author label upgrade. If an author's address
// carries a REVERSE RECORD on the active network's ENS deployment, the UI
// shows their name (e.g. "wave.eth" or a subdomain) instead of the truncated
// address — in the feed, threads, who-to-follow and profiles. Falls back to
// the truncated address (the truth) when there is no record, the RPC can't
// answer, or the network has no ENS wiring (mainnet until enabled).
//
// ⚠️ ENS is PER-CHAIN: Sepolia has its OWN testnet ENS registry — a mainnet
// name does not appear here unless the wallet ALSO set the Sepolia reverse
// record. That's the honest semantic; we never fabricate a name.
import 'server-only'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { currentNetwork } from './networks'

// Process-lifetime cache: reverse records change rarely; one lookup per
// author per network per boot. null (no record) is cached too.
const cache = new Map<string, string | null>()

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ])
  } catch {
    return null
  }
}

export async function resolveEnsName(address: string): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  const net = await currentNetwork()
  // ENS wiring: Sepolia's testnet ENS (the local fork mirrors Sepolia state,
  // so the same contracts answer through the fork RPC). Mainnet until it is
  // enabled has no resolver here — the truncated address stays the truth.
  if (!net.rpc || net.id === 'mainnet') return null
  const key = `${net.id}:${address.toLowerCase()}`
  if (cache.has(key)) return cache.get(key) ?? null
  const client = createPublicClient({ chain: sepolia, transport: http(net.rpc) })
  let name: string | null = null
  try {
    name = await withTimeout(client.getEnsName({ address: address as `0x${string}` }), 3_000)
  } catch {
    name = null
  }
  // Sanity: a stale reverse record can point at a name whose forward record
  // no longer resolves to this address — viem verifies this when it returns
  // the name; if anything looks off we keep null.
  cache.set(key, name ?? null)
  return name ?? null
}

/** The author label: ENS name when detected, else the truncated address. */
export async function authorLabel(address: string): Promise<string> {
  const ens = await resolveEnsName(address)
  if (ens) return ens
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  return short
}
