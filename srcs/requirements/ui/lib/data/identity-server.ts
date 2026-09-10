// AgentBook identity resolution — server-side only (World Chain RPC lives
// here, never in the client bundle). This is the "World AgentKit plug-in" the
// identity seam (lib/identity.ts) was waiting for: addresses resolve to
// { verifiedHuman, humanId } against the canonical AgentBook deployment.
//
// Honest degradation, never a throw and never a fabricated verification:
//   - WORLD_IDENTITY_LOOKUP=off            → pure offline seam (truncated addr)
//   - World Chain RPC unreachable           → offline, result NOT cached
//   - address not in AgentBook              → verifiedHuman false (cached — real answer)
//   - address in WORLD_AGENTBOOK_DEV_ALLOW  → dev fixture "verified" (demo only,
//     until the agent wallets are actually registered via agentkit-cli)
import 'server-only'
import { createAgentBookVerifier } from '@worldcoin/agentkit'
import { identityFromAddress, type Identity } from '../identity'

const TTL_MS = 5 * 60_000
const cache = new Map<string, { identity: Identity; expiresAt: number }>()

const LOOKUP_OFF = process.env.WORLD_IDENTITY_LOOKUP === 'off'
const DEV_ALLOW = new Set(
  (process.env.WORLD_AGENTBOOK_DEV_ALLOW ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
)

/** The wave agent wallets surfaced in the Settings trust panel (public
 *  addresses — the keys live only in the agent's .env). */
export const AGENT_WALLETS = [
  {
    role: 'publisher',
    address: process.env.WORLD_AGENT_PUBLISHER_ADDR ?? '0xf4AF4E8f4F49032257D9C1e3F1d9c5324a040620',
  },
  {
    role: 'retuner',
    address: process.env.WORLD_AGENT_RETUNER_ADDR ?? '0x92b4747d624253f1B7598A996bb44855d8008017',
  },
]

export function devFixturesActive(): boolean {
  return DEV_ALLOW.size > 0
}

let verifier: ReturnType<typeof createAgentBookVerifier> | undefined
function agentBook() {
  verifier ??= createAgentBookVerifier()
  return verifier
}

export async function resolveIdentity(address: string): Promise<Identity> {
  const offline = identityFromAddress(address)
  if (LOOKUP_OFF || !address) return offline

  const key = address.toLowerCase()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.identity

  let humanId: string | null
  if (DEV_ALLOW.has(key)) {
    humanId = `dev:${key}`
  } else {
    try {
      humanId = await agentBook().lookupHuman(address)
    } catch {
      // RPC down: degrade to offline without caching — a later request
      // should retry, not serve 5 minutes of "unverified".
      return offline
    }
  }

  const identity: Identity = { ...offline, verifiedHuman: humanId !== null, humanId }
  cache.set(key, { identity, expiresAt: Date.now() + TTL_MS })
  return identity
}
