'use server'

// followStrategy — ENS `wave.following/<strategyId>` setText (Pietro.md 🔑).
// NOT a DB insert. Proxies the agent's autonomous setText write tool so the
// browser never holds the ENS writer key (frontend.md §8).
//
// Until WAVE_ENS_WIRED=true AND the agent is reachable with a funded writer
// key, returns { ok:false, reason } — never fabricates a follow edge.

import { ens, ENS_KEYS } from '@/lib/clients/ens'

const AGENT_URL = process.env.AGENT_URL ?? 'http://agent:3002'
const ENS_WIRED = process.env.WAVE_ENS_WIRED === 'true'

export interface FollowResult {
  ok: boolean
  txHash?: string
  reason?: string
}

/**
 * Write `wave.following/<strategyId> = "1"` on the follower's ENS name.
 * `followerName` must be a resolved ENS name the agent writer can setText on
 * (demo: the seeded parent/subname the announcer key owns).
 */
export async function followStrategy(
  strategyId: string,
  followerName: string,
): Promise<FollowResult> {
  if (!strategyId || !followerName) {
    return { ok: false, reason: 'missing strategyId or followerName' }
  }
  if (!ENS_WIRED) {
    return {
      ok: false,
      reason: 'ENS writes offline (WAVE_ENS_WIRED≠true) — follow is an ENS setText',
    }
  }

  const key = `${ENS_KEYS.followingPrefix}${strategyId.toLowerCase()}`

  // Prefer agent MCP write (holds the ENS writer key). Fall back to a clear
  // error — never pretend the follow landed.
  try {
    const res = await fetch(`${AGENT_URL}/api/tools/setText/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { name: followerName, key, value: '1' } }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const json = (await res.json()) as { txHash?: string; result?: { txHash?: string } }
      const txHash = json.txHash ?? json.result?.txHash
      if (txHash) return { ok: true, txHash }
    }
  } catch {
    // try alternate Mastra tool path below
  }

  // Mastra sometimes mounts tools under /api/mcp/... — probe, then fail honest.
  try {
    const res = await fetch(`${AGENT_URL}/api/mcp/wave/setText`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: followerName, key, value: '1' }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const json = (await res.json()) as { txHash?: string }
      if (json.txHash) return { ok: true, txHash: json.txHash }
    }
  } catch {
    /* fall through */
  }

  // Direct ENS read client can't write without a key in the UI process —
  // surface the gap so the demo narrates it.
  void ens
  return {
    ok: false,
    reason:
      'agent setText unreachable — start the agent with ENS writer key, or follow via ensAgent',
  }
}

/** Read whether a follower name currently carries the follow record (best-effort). */
export async function isFollowing(
  strategyId: string,
  followerName: string,
): Promise<boolean> {
  if (!ENS_WIRED || !followerName) return false
  const key = `${ENS_KEYS.followingPrefix}${strategyId.toLowerCase()}`
  const value = await ens.getTextRecord(followerName, key)
  return value !== null && value !== '' && value !== '0'
}
