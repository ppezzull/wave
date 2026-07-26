// ENS text-record reader — server-side only.
//
// When WAVE_ENS_WIRED !== 'true', every read returns null (empty = truth; never
// fabricate). When wired, reads Sepolia via viem getEnsText — same path as the
// agent client (docs/strategy/ENS-PATH.md §4). Server-only, so no ENS logic
// reaches the browser (frontend.md §8).
//
// Alt path (agent MCP over AGENT_URL) stays available if we later want to keep
// viem entirely out of the UI process; the interface below is stable either way.
import 'server-only'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { normalize } from 'viem/ens'

const NOT_WIRED = process.env.WAVE_ENS_WIRED !== 'true'
const RPC_URL =
  process.env.SEPOLIA_RPC_URL ??
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ??
  'https://ethereum-sepolia-rpc.publicnode.com'

let client: ReturnType<typeof createPublicClient> | null = null
function publicClient() {
  if (!client) {
    client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
  }
  return client
}

// Standard ENS text-record keys (ENSIP-5) + wave's custom keys.
export const ENS_KEYS = {
  description: 'description',
  avatar: 'avatar',
  twitter: 'com.twitter',
  url: 'url',
  programHash: 'v0.programhash',
  // wave's "Most Creative Use of ENS" keys:
  followingPrefix: 'wave.following/', // wave.following/<strategyId>
} as const

export const ens = {
  /**
   * Read a single text record from `name`. Returns null when the reader is not
   * wired OR the record is unset. Never throws on "absent".
   */
  async getTextRecord(name: string, key: string): Promise<string | null> {
    if (NOT_WIRED) return null
    try {
      const value = await publicClient().getEnsText({
        name: normalize(name),
        key,
      })
      return value ?? null
    } catch {
      // Unresolvable name / network blip → empty is the truth.
      return null
    }
  },

  async resolveAvatar(name: string): Promise<string | null> {
    return this.getTextRecord(name, ENS_KEYS.avatar)
  },

  async resolveDescription(name: string): Promise<string | null> {
    return this.getTextRecord(name, ENS_KEYS.description)
  },
}
