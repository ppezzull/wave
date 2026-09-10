'use server'

// World identity actions — the client-side bridge to the server-only AgentBook
// resolver (lib/data/identity-server.ts). useSessionUser calls getWorldIdentity
// for the connected wallet; the Settings trust panel calls getWorldTrustPanel
// for the wave agent wallets' human-backed status.
import { AGENT_WALLETS, devFixturesActive, resolveIdentity } from '@/lib/data/identity-server'
import type { Identity } from '@/lib/identity'

export async function getWorldIdentity(address: string): Promise<Identity> {
  return resolveIdentity(address)
}

export interface TrustEntry {
  role: string
  address: string
  verifiedHuman: boolean
}

export async function getWorldTrustPanel(): Promise<{
  agents: TrustEntry[]
  devFixtures: boolean
}> {
  const resolved: Identity[] = await Promise.all(AGENT_WALLETS.map((w) => resolveIdentity(w.address)))
  return {
    agents: AGENT_WALLETS.map((w, i) => ({
      role: w.role,
      address: w.address,
      verifiedHuman: resolved[i].verifiedHuman,
    })),
    devFixtures: devFixturesActive(),
  }
}
