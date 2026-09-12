// The data-access facade — server-side only.
//
// ONE switch: WAVE_USE_MOCK. Default 'true' for local/demo without env.
// Flip to 'false' against Studio wave v0.0.4 (issue #51 — live seed).
//
// Every export is always-async (the live layer is async; the mock layer wraps
// sync accessors in resolved promises) so call sites `await` once and never
// change between modes.
import 'server-only'
import * as mock from './mock'
import * as server from './server'
import type { Strategy, Profile, ProfileStats } from '../mock-data'

export type { Strategy, Profile, ProfileStats }

const USE_MOCK = process.env.WAVE_USE_MOCK === 'true' // prod default: REAL subgraph data — mock is explicit opt-in only

/** Resolved data mode — server-only. The layout passes this to the client shell
 * so the create-drawer can pick the live compose stream vs the canned mock demo
 * WITHOUT exposing the mode as NEXT_PUBLIC_ (the env is server-only). */
export function isMockMode(): boolean {
  return USE_MOCK
}

export async function getFeed(now?: number): Promise<{ ranked: Strategy[]; unranked: Strategy[] }> {
  return USE_MOCK ? mock.getFeed(now) : server.getFeed(now)
}

export async function getStrategy(id: string): Promise<Strategy | null> {
  return USE_MOCK ? mock.getStrategy(id) : server.getStrategy(id)
}

/** Slow derived fields (recompiled bytecode/safety/hash) for the detail page —
 *  awaited inside its own Suspense boundary, not by the base card. */
export async function getDerivedStrategy(id: string): Promise<Strategy | null> {
  return USE_MOCK ? mock.getStrategy(id) : server.getDerivedStrategy(id)
}

/** The real "For you": similarity of the feed to the wallet's OWN deployed
 *  descriptions (TF-IDF cosine, lib/similarity.ts). null = nothing to match
 *  from yet — the client falls back to the leaderboard, never fabricates. */
export async function getSimilarFeed(
  address: string,
): Promise<Array<{ strategy: Strategy; matchPct: number }> | null> {
  return USE_MOCK ? Promise.resolve(null) : server.getSimilarFeed(address)
}

export async function getSwapHistory(strategyId: string, limit?: number) {
  return USE_MOCK ? mock.getSwapHistory(strategyId, limit) : server.getSwapHistory(strategyId, limit)
}

export async function getProfile(handle: string): Promise<Profile | null> {
  return USE_MOCK ? mock.getProfile(handle) : server.getProfile(handle)
}

export async function getProfileStats(profile: Profile): Promise<ProfileStats> {
  return USE_MOCK ? mock.getProfileStats(profile) : server.getProfileStats(profile)
}

export async function getRecentThreads(limit?: number): Promise<Strategy[]> {
  return USE_MOCK ? mock.getRecentThreads(limit) : server.getRecentThreads(limit)
}

/** Live /chat threads: the wallet's on-chain authorships. Mock data has no wallet
 *  authorships (its users are named, not addressed) — the mock /chat path uses
 *  getRecentThreads and never routes here. */
export async function getThreadsByAuthor(address: string, limit?: number): Promise<Strategy[]> {
  return USE_MOCK ? Promise.resolve([]) : server.getThreadsByAuthor(address, limit)
}

export async function getCurrentUser(): Promise<Profile & { walletAddress: string }> {
  return USE_MOCK ? mock.getCurrentUser() : server.getCurrentUser()
}

// generateStaticParams helper for the dynamic routes — mock-only param sets
// (live mode is dynamic via `export const dynamic = 'force-dynamic'`).
export async function listStrategyIds(): Promise<string[]> {
  if (USE_MOCK) {
    const { strategies } = await import('../mock-data')
    return strategies.map((s) => s.id)
  }
  try {
    const subs = await import('../clients/subgraph')
    return (await subs.subgraph.listStrategies()).map((s) => s.id)
  } catch {
    return []
  }
}

export async function listProfileHandles(): Promise<string[]> {
  if (USE_MOCK) {
    const { profiles } = await import('../mock-data')
    return profiles.map((p) => p.handle)
  }
  return [] // live profiles resolve through the identity seam (not wired)
}
