// Pure render helpers + the ranking formula — shared by BOTH the mock data
// layer (lib/mock-data.ts) and the live data layer (lib/data/server.ts).
//
// These are mode-independent: raw subgraph/ENS values in (wei strings, unix
// seconds, bytes32 hex), display strings out. They contain NO business logic
// beyond the documented ranking formula (Pietro.md 🔢), so they're safe for
// the server data layer and for leaf components alike.
//
// Re-exported from lib/mock-data.ts so existing `@/lib/mock-data` imports keep
// working during the mock→live migration.

import type { Strategy } from '../mock-data'

// The deterministic "now" the mock uses (avoids SSR/hydration drift from
// Date.now() at module load). The live data layer passes Date.now()/1000.
export const CURRENT_NOW = 1_780_000_000

// ── format helpers ────────────────────────────────────────────────────────

// wei string -> '12.4 ETH'
export function formatEth(wei: string, decimals = 18, places = 1): string {
  const n = Number(wei) / 10 ** decimals
  return `${n.toFixed(places)} ETH`
}

// wei string -> '$847K' style (assume ~$3k/ETH for the mock)
export function formatUsd(wei: string, ethUsd = 3000): string {
  const usd = (Number(wei) / 1e18) * ethUsd
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`
  return `$${Math.round(usd)}`
}

// unix seconds -> 'last swap 2h ago' / '47m ago' / 'never'
export function formatRecency(unixSeconds: number, now = CURRENT_NOW): string {
  if (unixSeconds === 0) return 'never swapped'
  const diff = Math.max(0, now - unixSeconds)
  const m = Math.floor(diff / 60)
  if (m < 60) return `last swap ${m}m ago`
  const h = Math.floor(diff / 3600)
  if (h < 24) return `last swap ${h}h ago`
  const d = Math.floor(diff / 86400)
  return `last swap ${d}d ago`
}

// ── ranking formula (Pietro.md 🔢) ─────────────────────────────────────────
// rank = returnPct × recencyDecay × (1 + log2(1 + followerCount))

// C2b INTERIM (docs/strategy/SUBGRAPH-CONTRACT-GAPS.md C2).
// returnPct's true denominator is committed capital, which NO event emits today
// (C2a blocked on a contract change). So:
//   - if the strategy CARRIES a committedCapital (mock data, or a future C2a
//     contract emit), use the rigorous PnL-on-capital formula;
//   - otherwise fall back to the C2b turnover-ratio proxy (out/in − 1) so the
//     ranking still sorts against live subgraph data. Restore the denominator
//     unconditionally when C2a lands.
export function returnPct(s: Strategy): number {
  const cap = Number(s.committedCapital)
  if (cap > 0) {
    return ((Number(s.cumulativeVolumeOut) - cap) / cap) * 100
  }
  const inn = Number(s.cumulativeVolumeIn)
  if (inn === 0) return 0
  return (Number(s.cumulativeVolumeOut) / inn - 1) * 100
}

// signed, 1-decimal display string, e.g. '+247.3%' / '-12.4%'
export function returnPctStr(s: Strategy): string {
  const v = returnPct(s)
  return `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}%`
}

// recencyDecay = 0.5 ^ (hoursSinceLastSwap / 24)
export function recencyDecay(s: Strategy, now = CURRENT_NOW): number {
  if (s.lastSwapTimestamp === 0) return 0
  const hours = (now - s.lastSwapTimestamp) / 3600
  return 0.5 ** (hours / 24)
}

// rank = returnPct × recencyDecay × (1 + log2(1 + followerCount))
export function rank(s: Strategy, now = CURRENT_NOW): number {
  return (
    returnPct(s) *
    recencyDecay(s, now) *
    (1 + Math.log2(1 + s.followerCount))
  )
}

// L1 listing threshold (consumer-layer rule): ranks iff swapCount>=3 AND age>=1h.
export function isRanked(s: Strategy, now = CURRENT_NOW): boolean {
  return s.swapCount >= 3 && now - s.lastSwapTimestamp >= 3600
}

// ── hash-verify ────────────────────────────────────────────────────────────
// 'pending' when programHash is bytes32(0) (C3: compiler not wired yet — D3
// gate), 'match' when on-chain == ENS record, 'mismatch' when tampered.
export type HashState = 'match' | 'mismatch' | 'pending'

export const ZERO_HASH = `0x${'0'.repeat(64)}`

export function hashState(s: Strategy): HashState {
  if (s.programHash === ZERO_HASH) return 'pending'
  return s.programHash === s.ensProgramHash ? 'match' : 'mismatch'
}

// abbreviate a bytes32 hex for display: '0x3a7f...e072'
export function abbrevHash(hash: string): string {
  if (hash.length <= 12) return hash
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}
