// Real data-access layer — server-side only.
//
// Reads the live subgraph (lib/clients/subgraph.ts) and maps it into the UI's
// Strategy / Profile shapes. NEVER fabricates: when a source is absent
// (production subgraph not deployed → Strategy entity empty; identity seam
// offline → no author attribution) the fields degrade to empty/pending/zero,
// which the components already render honestly.
//
// Author identity is on-chain now (task #31): the factory's StrategyAttributed
// event gives every strategy an author ADDRESS, which keys profiles (/u/<addr>),
// threads (/chat) and the authorHandle on cards. Richer identity (name, bio,
// verified-human) is the World AgentKit seam — lib/identity.ts is the plug-in
// point, empty here is the truth, never fabricated.
import 'server-only'
import { subgraph, type SubgraphStrategy } from '../clients/subgraph'
import { identityFromAddress } from '../identity'
import type { Strategy, Profile, ProfileStats } from '../mock-data'

// Subgraph `now` is real time (seconds). Pages that need determinism pass a
// fixed value; otherwise this reflects request time.
const nowSecs = () => Math.floor(Date.now() / 1000)

// The subgraph's unattributed sentinel (set at entity creation, replaced by
// StrategyAttributed) — lowercase like graph-node's Bytes serialization.
const ZERO_AUTHOR = '0x0000000000000000000000000000000000000000'

// ── subgraph Strategy → UI Strategy ─────────────────────────────────────────
async function hydrateStrategy(s: SubgraphStrategy): Promise<Strategy> {
  return {
    // subgraph-sourced (1:1)
    id: s.id,
    programHash: s.programHash,
    status: s.status,
    cumulativeVolumeIn: s.cumulativeVolumeIn,
    cumulativeVolumeOut: s.cumulativeVolumeOut,
    swapCount: s.swapCount,
    lastSwapTimestamp: s.lastSwapTimestamp,
    // on-chain authorship (factory attribute) — truncated address until the
    // identity seam resolves richer names. ZERO sentinel = unattributed
    // (pre-factory ship / no connected wallet) → empty handle, never fabricated.
    authorHandle:
      s.author && s.author !== ZERO_AUTHOR ? identityFromAddress(s.author).handle : '',
    // The post, as shipped (StrategyDescribed) — "" for pre-event strategies. Fork
    // prefill round-trips these exact bytes back into the composer.
    description: s.description ?? '',
    ensProgramHash: s.programHash, // fall back to on-chain hash
    committedCapital: s.committedCapital || '',
    oracleBand: '',
    bytecode: [],
    safety: { pending: true, verdict: 'UNSAFE', monotonicity: 0, symmetry: '', guardTriggers: 0, skewVsCap: 0 },
    retunes: [],
  }
}

// ── feed ────────────────────────────────────────────────────────────────────
export async function getFeed(now = nowSecs()): Promise<{ ranked: Strategy[]; unranked: Strategy[] }> {
  // Dynamic import to avoid a cycle: the formula helpers import the Strategy
  // type from mock-data, which is fine, but keep the rank logic in one place.
  const { isRanked, rank } = await import('../strategy/format')
  const raw = await subgraph.listStrategies()
  const hydrated = await Promise.all(raw.map(hydrateStrategy))
  const ranked = hydrated
    .filter((s) => isRanked(s, now))
    .sort((a, b) => rank(b, now) - rank(a, now))
  const unranked = hydrated.filter((s) => !isRanked(s, now))
  return { ranked, unranked }
}

export async function getStrategy(id: string): Promise<Strategy | null> {
  const raw = await subgraph.getStrategy(id)
  if (!raw) return null
  return hydrateStrategy(raw)
}

export async function getSwapHistory(strategyId: string, limit = 50) {
  return subgraph.getSwapHistory(strategyId, limit)
}

// ── profile ──────────────────────────────────────────────────────────────────
// ADDRESS-keyed (task #31): on-chain authorship makes the wallet the identity.
// Non-address handles → not found (the mock layer serves its own named users).
const isWalletAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value)

export async function getProfile(handle: string): Promise<Profile | null> {
  if (!isWalletAddress(handle)) return null
  const address = handle.toLowerCase()
  const identity = identityFromAddress(address)
  const authored = await subgraph.listStrategiesByAuthor(address)
  return {
    handle: address,
    name: identity.handle, // truncated address until the identity seam resolves more
    displayName: '',
    bio: '',
    avatarUrl: '',
    twitter: '',
    strategyIds: authored.map((s) => s.id),
  }
}

export async function getProfileStats(profile: Profile): Promise<ProfileStats> {
  // ONE author-keyed fetch; the SAME formula as the mock layer's profileStats
  // (mock-data.ts) so mock and live can never disagree on the math.
  const authored = await subgraph.listStrategiesByAuthor(profile.handle)
  const totalCap = authored.reduce((sum, s) => sum + Number(s.committedCapital), 0)
  const totalOut = authored.reduce((sum, s) => sum + Number(s.cumulativeVolumeOut), 0)
  const totalFills = authored.reduce((sum, s) => sum + s.swapCount, 0)
  const totalRet = totalCap === 0 ? 0 : ((totalOut - totalCap) / totalCap) * 100
  const { formatUsd } = await import('../strategy/format')
  return {
    totalReturnStr: `${totalRet >= 0 ? '+' : '-'}${Math.abs(totalRet).toFixed(1)}%`,
    totalReturnPositive: totalRet >= 0,
    strategiesShipped: authored.length,
    totalVolume: formatUsd(String(Math.round(totalOut))),
    avgFills: authored.length ? Math.round(totalFills / authored.length) : 0,
  }
}

// ── chat list / current user ─────────────────────────────────────────────────
// /chat lists "threads" — in the no-DB design these are the user's shipped
// strategies (the only persistent object): the session wallet's authorships.
// getRecentThreads stays a mock-layer concept; live mode keys on the wallet.
export async function getRecentThreads(_limit = 20): Promise<Strategy[]> {
  return []
}

export async function getThreadsByAuthor(address: string, limit = 6): Promise<Strategy[]> {
  const authored = await subgraph.listStrategiesByAuthor(address)
  const hydrated = await Promise.all(authored.map(hydrateStrategy))
  return hydrated
    .sort((a, b) => b.lastSwapTimestamp - a.lastSwapTimestamp)
    .slice(0, limit)
}

// Current user — Privy session → wallet → identity seam. Privy not wired yet →
// returns a minimal empty profile (truth). The mock layer provides alice.eth.
export async function getCurrentUser(): Promise<Profile & { walletAddress: string }> {
  return {
    handle: '',
    name: '',
    displayName: '',
    bio: '',
    avatarUrl: '',
    twitter: '',
    strategyIds: [],
    walletAddress: '',
  }
}
