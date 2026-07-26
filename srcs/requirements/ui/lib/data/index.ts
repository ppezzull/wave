// The data-access facade — server-side only.
//
// ONE switch: WAVE_USE_MOCK. Default 'true' for local/demo without env.
// Flip to 'false' against Studio wave v0.0.4 (issue #51 — live seed).
// Flip WAVE_ENS_WIRED=true once ENS records resolve for author identity.
//
// Every export is always-async (the live layer is async; the mock layer wraps
// sync accessors in resolved promises) so call sites `await` once and never
// change between modes.
import 'server-only'
import * as mock from './mock'
import * as server from './server'
import type { Strategy, ENSProfile, ProfileStats } from '../mock-data'

export type { Strategy, ENSProfile, ProfileStats }

const USE_MOCK = process.env.WAVE_USE_MOCK !== 'false' // default true

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

export async function getSwapHistory(strategyId: string, limit?: number) {
  return USE_MOCK ? mock.getSwapHistory(strategyId, limit) : server.getSwapHistory(strategyId, limit)
}

export async function getProfile(handle: string): Promise<ENSProfile | null> {
  return USE_MOCK ? mock.getProfile(handle) : server.getProfile(handle)
}

export async function getProfileStats(profile: ENSProfile): Promise<ProfileStats> {
  return USE_MOCK ? mock.getProfileStats(profile) : server.getProfileStats(profile)
}

export async function getFollowed(ensNode?: string): Promise<Strategy[]> {
  return USE_MOCK ? mock.getFollowed(ensNode ?? '') : server.getFollowed(ensNode ?? '')
}

export async function getFollowedStrategies(): Promise<Strategy[]> {
  return USE_MOCK ? mock.getFollowedStrategies() : server.getFollowedStrategies()
}

export async function getFollowerStrategies(): Promise<Strategy[]> {
  return USE_MOCK ? mock.getFollowerStrategies() : server.getFollowerStrategies()
}

export async function getRecentThreads(limit?: number): Promise<Strategy[]> {
  return USE_MOCK ? mock.getRecentThreads(limit) : server.getRecentThreads(limit)
}

export async function getCurrentUser(): Promise<ENSProfile & { walletAddress: string }> {
  return USE_MOCK ? mock.getCurrentUser() : server.getCurrentUser()
}

// "Who to follow" suggestions for the right rail. Mock: seed profiles; live:
// empty until an ENS discovery index lands.
export async function getSuggestedProfiles(): Promise<ENSProfile[]> {
  return USE_MOCK ? mock.getSuggestedProfiles() : server.getSuggestedProfiles()
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
  return [] // live profiles come from ENS discovery (not wired)
}
