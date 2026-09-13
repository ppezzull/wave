// Session marker in localStorage — Ledger device OR the local Anvil door.
//
// This is a session MARKER, not an auth boundary. Kind lives on the record
// so resolveSession can tell a real Nano sign-in from "Continue with local
// account". Missing kind = ledger (legacy device sessions).

'use client'

import {
  parseSessionMarker,
  type SessionMarker,
  type SessionMarkerKind,
} from '@/lib/session'

export type LedgerSession = SessionMarker

const KEY = 'wave-ledger-session'

export function readLedgerSession(): LedgerSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    return parseSessionMarker(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function writeMarker(address: string, kind: SessionMarkerKind): LedgerSession {
  const session: LedgerSession = { address, kind, connectedAt: Date.now() }
  window.localStorage.setItem(KEY, JSON.stringify(session))
  window.dispatchEvent(new CustomEvent('wave-ledger-session'))
  return session
}

/** Real device sign-in (Nano recovered address). */
export function writeLedgerSession(address: string): LedgerSession {
  return writeMarker(address, 'ledger')
}

/** Landing "Continue with local account" (Anvil #0). */
export function writeLocalSession(address: string): LedgerSession {
  return writeMarker(address, 'local')
}

export function clearLedgerSession(): void {
  window.localStorage.removeItem(KEY)
  window.dispatchEvent(new CustomEvent('wave-ledger-session'))
}

/** The ASCII sign-in message the device clear-signs (DMK frames by string
 *  length and encodes UTF-8 — non-ASCII desyncs the device, keep it plain). */
export function ledgerSignInMessage(): string {
  return `wave sign-in [${Date.now()}] -- confirm on your Ledger`
}
