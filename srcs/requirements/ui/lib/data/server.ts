// Real data-access layer — server-side only.
//
// Reads the live subgraph (lib/clients/subgraph.ts) and maps it into the UI's
// Strategy / Profile shapes. NEVER fabricates: when a source is absent
// (production subgraph not deployed → Strategy entity empty; identity seam
// offline → no author attribution) the fields degrade to empty/pending/zero,
// which the components already render honestly.
//
// Author identity (authorHandle, profile fields) is intentionally empty in the
// live layer: the ENS identity layer is gone, and attribution returns when
// World AgentKit resolves identities through lib/identity.ts.
import 'server-only'
import { subgraph, type SubgraphStrategy } from '../clients/subgraph'
import type { Strategy, Profile, ProfileStats } from '../mock-data'

// Subgraph `now` is real time (seconds). Pages that need determinism pass a
// fixed value; otherwise this reflects request time.
const nowSecs = () => Math.floor(Date.now() / 1000)

// ── subgraph Strategy → UI Strategy ─────────────────────────────────────────
// Author identity stays empty (truth) until the identity seam has a live
// source; the strategy itself lists fine without it.
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
    // identity-sourced (empty until the seam resolves authors)
    authorHandle: '',
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
// A profile shell keyed by handle — every display field empty until the
// identity seam (World AgentKit) can resolve real profile data.
export async function getProfile(handle: string): Promise<Profile | null> {
  return {
    handle,
    name: handle,
    displayName: '',
    bio: '',
    avatarUrl: '',
    twitter: '',
    strategyIds: [],
  }
}

export async function getProfileStats(_profile: Profile): Promise<ProfileStats> {
  // Aggregates over authored strategies — zero until strategies are live.
  return {
    totalReturnStr: '+0.0%',
    totalReturnPositive: true,
    strategiesShipped: 0,
    totalVolume: '$0',
    avgFills: 0,
  }
}

// ── chat list / current user ─────────────────────────────────────────────────
// /chat lists "threads" — in the no-DB design these are the user's shipped
// strategies (the only persistent object). Empty until live.
export async function getRecentThreads(_limit = 20): Promise<Strategy[]> {
  return []
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
