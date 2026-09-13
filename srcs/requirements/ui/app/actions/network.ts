'use server'

// Network selection — the Settings selector's persistence. A cookie (not a
// rebuild, not an env change): every server render/action resolves its
// subgraph + RPC per request, so the whole read surface switches instantly.
import { cookies } from 'next/headers'
import { NETWORK_COOKIE, NETWORKS, type NetworkId } from '@/lib/networks'

export async function setNetwork(id: NetworkId): Promise<{ ok: boolean; reason?: string }> {
  const net = NETWORKS[id]
  if (!net) return { ok: false, reason: 'unknown network' }
  if (net.status !== 'live') {
    return { ok: false, reason: `${net.label} is not enabled yet. ${net.note ?? ''}` }
  }
  const jar = await cookies()
  jar.set(NETWORK_COOKIE, id, {
    httpOnly: false, // harmless (a network id, not a secret); lets devtools show it
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return { ok: true }
}

export async function getSelectedNetwork(): Promise<NetworkId> {
  const jar = await cookies()
  return jar.get(NETWORK_COOKIE)?.value as NetworkId | undefined ?? 'sepolia'
}
