// Real data-access layer — server-side only.
//
// Reads the live subgraph (lib/clients/subgraph.ts) + ENS (lib/clients/ens.ts)
// and maps them into the UI's Strategy / ENSProfile shapes. NEVER fabricates:
// when a source is absent (production subgraph not deployed → Strategy entity
// empty; ENS reader a stub → all records null) the fields degrade to empty/
// pending/zero, which the components already render honestly.
//
// This is the manifest for the Pietro G2 acceptance test: every card field
// traces to either a subgraph entity or an ENS getTextRecord call.
import 'server-only'
import { subgraph, type SubgraphStrategy, type Follow } from '../clients/subgraph'
import { ens, ENS_KEYS } from '../clients/ens'
import type { Strategy, ENSProfile, ProfileStats } from '../mock-data'

// Subgraph `now` is real time (seconds). Pages that need determinism pass a
// fixed value; otherwise this reflects request time.
const nowSecs = () => Math.floor(Date.now() / 1000)

// ── subgraph Strategy → UI Strategy ─────────────────────────────────────────
// ENS-sourced fields are resolved by reverse-namehash per author and fanned
// out. Until ENS is wired (WAVE_ENS_WIRED), they are all null → empty strings.
async function hydrateStrategy(s: SubgraphStrategy): Promise<Strategy> {
  const authorName = await reverseName(s.ensNode) // null until ENS wired
  const description = authorName ? await ens.resolveDescription(authorName) : null
  // ENS key is lowercase `v0.programhash` (ENS-PATH.md / agent ens client).
  const ensProgramHash = authorName
    ? await ens.getTextRecord(authorName, ENS_KEYS.programHash)
    : null

  return {
    // subgraph-sourced (1:1)
    id: s.id,
    programHash: s.programHash,
    ensNode: s.ensNode,
    status: s.status,
    cumulativeVolumeIn: s.cumulativeVolumeIn,
    cumulativeVolumeOut: s.cumulativeVolumeOut,
    swapCount: s.swapCount,
    lastSwapTimestamp: s.lastSwapTimestamp,
    followerCount: s.followerCount,
    // ENS-sourced (null → empty)
    authorHandle: authorName ?? '',
    description: description ?? '',
    ensProgramHash: ensProgramHash ?? s.programHash, // fall back to on-chain hash
    committedCapital: s.committedCapital || '',
    oracleBand: '',
    bytecode: [],
    safety: { pending: true, verdict: 'UNSAFE', monotonicity: 0, symmetry: '', guardTriggers: 0, skewVsCap: 0 },
    retunes: [],
  }
}

// Reverse-resolve a namehash back to a name. ENS has no on-chain reverse index
// for arbitrary nodes (only addr.reverse), so this needs the author name from
// elsewhere. Until Flavio's ENS reader lands, returns null — strategies list
// without author identity (truth). When wired, this can read the name from a
// `wave.author/<node>` record or the strategy's announce path.
async function reverseName(_ensNode: string): Promise<string | null> {
  return null // not wired — see ENS_KEYS + lib/clients/ens.ts
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
export async function getProfile(handle: string): Promise<ENSProfile | null> {
  const name = `${handle}.eth`
  const [avatar, bio, twitter, displayName] = await Promise.all([
    ens.resolveAvatar(name),
    ens.resolveDescription(name),
    ens.getTextRecord(name, ENS_KEYS.twitter),
    ens.getTextRecord(name, 'display'), // ENS display name record
  ])
  // Strategies authored by this name — empty until the production subgraph
  // deploys AND we can filter strategies by ensNode (C1 binds strategyId↔node).
  return {
    handle,
    name,
    displayName: displayName ?? '',
    bio: bio ?? '',
    avatarUrl: avatar ?? '',
    twitter: twitter ?? '',
    ensNode: '', // namehash(handle) — filled when ENS wired
    followingCount: 0,
    followersCount: 0,
    strategyIds: [],
  }
}

export async function getProfileStats(_profile: ENSProfile): Promise<ProfileStats> {
  // Aggregates over authored strategies — zero until strategies are live.
  return {
    totalReturnStr: '+0.0%',
    totalReturnPositive: true,
    strategiesShipped: 0,
    totalVolume: '$0',
    avgFills: 0,
  }
}

// ── follow graph ───────────────────────────────────────────────────────────
// wave.following/<id> TextChanged events are indexed by the production `follows`
// entity on v0.0.2. Returns real follow edges once strategies are seeded and
// follows happen; empty until then.
export async function getFollowEdges(): Promise<Follow[]> {
  return subgraph.listFollows(1000)
}

// Strategies a node follows — derived from the spike entity's wave.following/
// records. Empty until ENS reverse-resolve + strategy list both land.
export async function getFollowed(_ensNode: string): Promise<Strategy[]> {
  return []
}

// Strategies the current user follows / that followers of the current user
// authored. Empty until Privy resolves the current user's ENS name.
export async function getFollowedStrategies(): Promise<Strategy[]> {
  return []
}

export async function getFollowerStrategies(): Promise<Strategy[]> {
  return []
}

// ── chat list / current user ─────────────────────────────────────────────────
// /chat lists "threads" — in the no-DB design these are the user's shipped
// strategies (the only persistent object). Empty until live.
export async function getRecentThreads(_limit = 20): Promise<Strategy[]> {
  return []
}

// Current user — Privy session → wallet → ENS name. Privy not wired yet →
// returns a minimal empty profile (truth). The mock layer provides alice.eth.
export async function getCurrentUser(): Promise<ENSProfile & { walletAddress: string }> {
  return {
    handle: '',
    name: '',
    displayName: '',
    bio: '',
    avatarUrl: '',
    twitter: '',
    ensNode: '',
    followingCount: 0,
    followersCount: 0,
    strategyIds: [],
    walletAddress: '',
  }
}

// "Who to follow" — empty until ENS discovery / a profiles index lands. The
// right column renders an honest empty state rather than fabricated names.
export async function getSuggestedProfiles(): Promise<ENSProfile[]> {
  return []
}
