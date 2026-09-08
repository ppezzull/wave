// Mock data-access layer — thin async wrappers over the synchronous mock
// accessors in lib/mock-data.ts. The facade (lib/data/index.ts) selects this
// when WAVE_USE_MOCK !== 'false'. Signatures match lib/data/server.ts exactly
// so callers `await` once and never change between modes.
import 'server-only'
import {
  strategies as mockStrategies,
  rankedStrategies,
  unrankedStrategies,
  strategyById,
  profileByHandle,
  profileStats,
  currentUser,
  CURRENT_NOW,
} from '../mock-data'
import type { Strategy, Profile, ProfileStats } from '../mock-data'

export async function getFeed(now = CURRENT_NOW): Promise<{ ranked: Strategy[]; unranked: Strategy[] }> {
  return { ranked: rankedStrategies(now), unranked: unrankedStrategies(now) }
}

export async function getStrategy(id: string): Promise<Strategy | null> {
  return strategyById(id) ?? null
}

export async function getSwapHistory(_strategyId: string, _limit = 50) {
  return [] // mock doesn't model swap history rows
}

export async function getProfile(handle: string): Promise<Profile | null> {
  return profileByHandle(handle) ?? null
}

export async function getProfileStats(profile: Profile): Promise<ProfileStats> {
  return profileStats(profile)
}

export async function getRecentThreads(limit = 20): Promise<Strategy[]> {
  return mockStrategies.slice(0, limit)
}

export async function getCurrentUser(): Promise<Profile & { walletAddress: string }> {
  return currentUser
}
