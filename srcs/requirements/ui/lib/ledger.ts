// Ledger approval — the frontend half of the HITL gate contract.
//
// This module mirrors agent/src/ledger/approval.ts EXACTLY: same canonical
// JSON (recursively key-sorted), same sha256-slice hash, same message text.
// Both packages pin the same parity vector in their test suites
// (042b8b2f3874563dd943ea50c712a14c) — if either side changes the formula,
// that vector breaks and forces the other side to follow.
//
// Pure: no device imports, runs on the server (node:crypto via Web Crypto is
// not needed — Node 18+ has globalThis.crypto.subtle).

export type ApprovalKind = 'device' | 'session'

export interface ShipApproval {
  kind: ApprovalKind
  address: string
  message: string
  signature: string
}

/** Deterministic JSON: object keys sorted recursively (mirrors the agent). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

/** sha256 hex of the canonical form, first 32 chars — the action hash. */
export async function actionHashOf(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/**
 * The exact text the Ledger screen / wallet prompt shows and signs. STRICTLY
 * ASCII: the DMK signer kit writes a 4-byte length taken from the JS string
 * `.length` but encodes the payload with TextEncoder (UTF-8) — every non-ASCII
 * char desyncs the frame by its UTF-8 size and the ETH app returns 6980 / an
 * empty response ("no signature returned"). Fork-proven with the em-dash.
 * Keep byte-identical with agent/src/ledger/approval.ts.
 */
export function approvalMessage(actionHash: string, description: string): string {
  const ascii = (description.match(/[\x20-\x7e]+/g) ?? []).join(" ").slice(0, 200)
  return `wave HITL approval [${actionHash}] -- ${ascii}`
}

/** Ledger's {r,s,v} → a 0x-prefixed 65-byte EIP-191 signature (r ‖ s ‖ yParity).
 * v arrives as 0/1 (current firmware) or 27/28 (older); EIP-155 v≥35 cannot
 * occur for personal_sign. viem's recoverMessageAddress accepts yParity form. */
export function toEip191Signature(out: { r: string; s: string; v: number }): `0x${string}` {
  const body = (x: string) => (x.startsWith('0x') ? x.slice(2) : x).padStart(64, '0')
  const v = out.v >= 35 ? out.v - 35 : out.v >= 27 ? out.v - 27 : out.v
  const yParity = v & 1
  return `0x${body(out.r)}${body(out.s)}${yParity.toString(16).padStart(2, '0')}` as `0x${string}`
}
