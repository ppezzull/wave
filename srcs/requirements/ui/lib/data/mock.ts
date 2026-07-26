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
  profiles as mockProfiles,
  profileStats,
  currentUser,
  CURRENT_NOW,
} from '../mock-data'
import type { Strategy, ENSProfile, ProfileStats } from '../mock-data'

export async function getFeed(now = CURRENT_NOW): Promise<{ ranked: Strategy[]; unranked: Strategy[] }> {
  return { ranked: rankedStrategies(now), unranked: unrankedStrategies(now) }
}

export async function getStrategy(id: string): Promise<Strategy | null> {
  return strategyById(id) ?? null
}

export async function getSwapHistory(_strategyId: string, _limit = 50) {
  return [] // mock doesn't model swap history rows
}

export async function getProfile(handle: string): Promise<ENSProfile | null> {
  return profileByHandle(handle) ?? null
}

export async function getProfileStats(profile: ENSProfile): Promise<ProfileStats> {
  return profileStats(profile)
}

export async function getFollowEdges() {
  return [] // mock models follows as the currentUser's FOLLOWED_IDS in pages
}

export async function getFollowed(_ensNode: string): Promise<Strategy[]> {
  return [] // pages read mock `strategies` directly for the follow list
}

// Mock-only: the signed-in user (alice) follows these strategy ids, and these
// authors follow alice. Live mode has no current user until Privy is wired.
export async function getFollowedStrategies(): Promise<Strategy[]> {
  return [mockStrategies[0], mockStrategies[3], mockStrategies[1]]
}

export async function getFollowerStrategies(): Promise<Strategy[]> {
  return [mockStrategies[4], mockStrategies[2]]
}

export async function getRecentThreads(limit = 20): Promise<Strategy[]> {
  return mockStrategies.slice(0, limit)
}

export async function getCurrentUser(): Promise<ENSProfile & { walletAddress: string }> {
  return currentUser
}

// "Who to follow" suggestions — the seed profiles (minus the current user) for
// the mock. Live mode has no profile-listing source until ENS discovery lands.
export async function getSuggestedProfiles(): Promise<ENSProfile[]> {
  return mockProfiles.filter((p) => p.handle !== currentUser.handle)
}
