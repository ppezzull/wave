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
// verified-human) is the trust seam — lib/identity.ts is the plug-in
// point, empty here is the truth, never fabricated.
import 'server-only'
import { subgraphFor, type SubgraphStrategy } from '../clients/subgraph'
import { ipfsGatewayUrl } from '../ipfs'
import { currentNetwork } from '../networks'
import { identityFromAddress } from '../identity'
import { deriveProgramFromDescription } from '../derive-program'
import { matchFeed, tokenizeDescription } from '../similarity'
import { authorLabel } from '../ens'
import type { Strategy, Profile, ProfileStats } from '../mock-data'

// Subgraph `now` is real time (seconds). Pages that need determinism pass a
// fixed value; otherwise this reflects request time.
const nowSecs = () => Math.floor(Date.now() / 1000)

// The subgraph's unattributed sentinel (set at entity creation, replaced by
// StrategyAttributed) — lowercase like graph-node's Bytes serialization.
const ZERO_AUTHOR = '0x0000000000000000000000000000000000000000'

// ── subgraph Strategy → UI Strategy ─────────────────────────────────────────
async function sg() {
  return subgraphFor((await currentNetwork()).subgraphUrl)
}

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
    // ENS when the network resolves a reverse record, else the truncated
    // address (lib/ens.ts — per-chain honest, never fabricated).
    authorHandle:
      s.author && s.author !== ZERO_AUTHOR ? await authorLabel(s.author) : '',
    // The post, as shipped (StrategyDescribed) — "" for pre-event strategies. Fork
    // prefill round-trips these exact bytes back into the composer.
    description: s.description ?? '',
    ensProgramHash: s.programHash, // recomputed from the post in getStrategy (detail only)
    committedCapital: s.committedCapital || '',
    oracleBand: '',
    bytecode: [],
    safety: { pending: true, verdict: 'SAFE' },
    retunes: [],
  }
}

// ── Who to follow — the REAL people panel ───────────────────────────────────
// The follow GRAPH died with ENS text-records (removed at continuity); the
// PANEL returns as real data: top AUTHORS on the active network, ranked by
// executed fills then strategy count — computed from the same subgraph rows
// the feed renders. Rows link to profiles; a follow EDGE needs a backend
// that doesn't exist yet, so there is no fake button.
export interface TopAuthor {
  address: string
  label: string
  strategies: number
  fills: number
  avatarUrl: string
}

export async function getTopAuthors(limit = 3): Promise<TopAuthor[]> {
  const rows = await (await sg()).listStrategies()
  const byAuthor = new Map<string, { strategies: number; fills: number }>()
  for (const r of rows) {
    if (!r.author || r.author === ZERO_AUTHOR) continue
    const agg = byAuthor.get(r.author.toLowerCase()) ?? { strategies: 0, fills: 0 }
    agg.strategies += 1
    agg.fills += r.swapCount
    byAuthor.set(r.author.toLowerCase(), agg)
  }
  const client = await sg()
  const ranked = [...byAuthor.entries()]
    .sort((a, b) => b[1].fills - a[1].fills || b[1].strategies - a[1].strategies)
    .slice(0, limit)
  return Promise.all(
    ranked.map(async ([address, agg]) => {
      const cid = await client.getAuthorAvatarCid(address)
      return {
        address,
        label: await authorLabel(address),
        avatarUrl: cid ? ipfsGatewayUrl(cid) : '',
        ...agg,
      }
    }),
  )
}

// ── What's new — the market's own vocabulary ────────────────────────────────
// The most common words across REAL strategy descriptions (subgraph truth):
// pure frequency over tokenizeDescription, one vote per strategy so a single
// spammy description can't dominate the cloud. Structural tokens (token0,
// curve, size…) are stopworded — what's left is what the crowd writes about.
const KEYWORD_STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'by', 'from', 'when', 'then', 'than', 'it', 'its', 'is', 'are', 'be', 'each',
  'every', 'above', 'below', 'between', 'into', 'over', 'under', 'up', 'down',
  'no', 'not', 'if', 'using', 'use', 'new', 'per', 'this', 'that', 'will',
  // structural strategy vocabulary — present in nearly every description
  'strategy', 'strategies', 'token', 'tokens', 'token0', 'token1', 'size',
  'size0', 'size1', 'blocks', 'block', 'curve', 'liquidity', 'two-token',
  'maker', 'taker', 'fee', 'fees', 'bps', 'eth',
])

export async function getStrategyKeywords(limit = 8): Promise<string[]> {
  const rows = await (await sg()).listStrategies()
  const freq = new Map<string, number>()
  for (const r of rows) {
    if (!r.description) continue
    const seen = new Set<string>()
    for (const tok of tokenizeDescription(r.description)) {
      if (seen.has(tok)) continue // one vote per strategy per word
      seen.add(tok)
      if (tok.length < 3) continue
      if (KEYWORD_STOP.has(tok)) continue
      if (tok.startsWith('0x')) continue // addresses
      if (/^\d+(?:[.\-_]\d+)*$/.test(tok)) continue // bare numbers
      freq.set(tok, (freq.get(tok) ?? 0) + 1)
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word)
}

// ── similarity feed (the real "For you") ────────────────────────────────────
// The wallet's OWN deployed descriptions are the taste profile; every other
// described strategy is ranked by TF-IDF cosine similarity to it (pure math
// over real subgraph data — lib/similarity.ts). Returns null when the wallet
// has nothing described yet: the client falls back to the leaderboard with an
// honest hint, never a fabricated ranking.
export async function getSimilarFeed(
  address: string,
): Promise<Array<{ strategy: Strategy; matchPct: number }> | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  const [own, all] = await Promise.all([
    (await sg()).listStrategiesByAuthor(address.toLowerCase()),
    (await sg()).listStrategies(),
  ])
  const described = own.filter((s) => s.description.trim().length > 0)
  if (described.length === 0) return null
  const matches = matchFeed({ own, pool: all })
  if (matches.length === 0) return null
  const byId = new Map(all.map((s) => [s.id, s]))
  const hydrated: Array<{ strategy: Strategy; matchPct: number }> = []
  for (const m of matches) {
    const raw = byId.get(m.id)
    if (!raw) continue
    hydrated.push({
      strategy: await hydrateStrategy(raw),
      matchPct: Math.round(m.score * 100),
    })
  }
  return hydrated
}

// ── feed ────────────────────────────────────────────────────────────────────
export async function getFeed(now = nowSecs()): Promise<{ ranked: Strategy[]; unranked: Strategy[] }> {
  // Dynamic import to avoid a cycle: the formula helpers import the Strategy
  // type from mock-data, which is fine, but keep the rank logic in one place.
  const { isRanked, rank } = await import('../strategy/format')
  const raw = await (await sg()).listStrategies()
  const hydrated = await Promise.all(raw.map(hydrateStrategy))
  const ranked = hydrated
    .filter((s) => isRanked(s, now))
    .sort((a, b) => rank(b, now) - rank(a, now))
  const unranked = hydrated.filter((s) => !isRanked(s, now))
  return { ranked, unranked }
}

/** Base strategy — subgraph only, fast. Feeds cards/lists and the detail
 *  page's above-the-fold content; the derive (below) streams in separately. */
export async function getStrategy(id: string): Promise<Strategy | null> {
  const raw = await (await sg()).getStrategy(id)
  if (!raw) return null
  return hydrateStrategy(raw)
}

/** Detail-page derivation: recompile the POST through the same parser +
 *  deterministic compiler the ship used. Real bytecode for the pane, and the
 *  RECOMPUTED hash as ensProgramHash — HashVerify becomes on-chain vs post
 *  instead of a tautology. Safety = the compiler's rule pass, not a score.
 *  No description / derivation failure → fields stay pending/empty (honest).
 *  Called inside its own Suspense boundary: the base card renders instantly,
 *  these panels stream when the compile lands (cached per description). */
export async function getDerivedStrategy(id: string): Promise<Strategy | null> {
  const raw = await (await sg()).getStrategy(id)
  if (!raw) return null
  const hydrated = await hydrateStrategy(raw)
  if (hydrated.description) {
    const derived = await deriveProgramFromDescription(hydrated.description)
    if (derived) {
      hydrated.bytecode = derived.bytecode
      if (derived.programHash) hydrated.ensProgramHash = derived.programHash
      hydrated.safety = {
        verdict: 'SAFE',
        rulesApplied: derived.rulesApplied,
        canonicalized: derived.canonicalized,
        pending: false,
      }
    }
  }
  return hydrated
}

export async function getSwapHistory(strategyId: string, limit = 50) {
  return (await sg()).getSwapHistory(strategyId, limit)
}

// ── profile ──────────────────────────────────────────────────────────────────
// ADDRESS-keyed (task #31): on-chain authorship makes the wallet the identity.
// Non-address handles → not found (the mock layer serves its own named users).
const isWalletAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value)

export async function getProfile(handle: string): Promise<Profile | null> {
  if (!isWalletAddress(handle)) return null
  const address = handle.toLowerCase()
  const identity = identityFromAddress(address)
  const client = await sg()
  const authored = await client.listStrategiesByAuthor(address)
  const avatarCid = await client.getAuthorAvatarCid(address)
  return {
    handle: address,
    name: identity.handle, // truncated address until the identity seam resolves more
    displayName: '',
    bio: '',
    avatarUrl: avatarCid ? ipfsGatewayUrl(avatarCid) : '',
    twitter: '',
    strategyIds: authored.map((s) => s.id),
  }
}

export async function getProfileStats(profile: Profile): Promise<ProfileStats> {
  // ONE author-keyed fetch; the SAME formula as the mock layer's profileStats
  // (mock-data.ts) so mock and live can never disagree on the math.
  const authored = await (await sg()).listStrategiesByAuthor(profile.handle)
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
  const authored = await (await sg()).listStrategiesByAuthor(address)
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

/** Gateway URL for the wallet's on-chain avatar CID. '' = none yet. */
export async function getAuthorAvatarUrl(address: string): Promise<string> {
  if (!isWalletAddress(address)) return ''
  const cid = await (await sg()).getAuthorAvatarCid(address)
  return cid ? ipfsGatewayUrl(cid) : ''
}

export type LatestVault = {
  ciphertextHex: string
  nonce: string
  timestamp: string
  txHash: string
}

/** Latest ChatVault row for this wallet on the active network. */
export async function getLatestChatVault(user: string): Promise<LatestVault | null> {
  if (!isWalletAddress(user)) return null
  return (await sg()).getLatestChatVault(user)
}
