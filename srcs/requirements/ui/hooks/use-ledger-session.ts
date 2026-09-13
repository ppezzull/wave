'use client'

// useLedgerSession — sign in WITH the Ledger device (no Privy wallet).
//
// signIn() must be called inside a click handler — WebHID's browser picker
// requires the user gesture, exactly like ship approvals. The device signs
// the ASCII sign-in message; the recovered address becomes the session.
import { useCallback, useEffect, useState } from 'react'
import { useLedgerApproval } from './use-ledger-approval'
import {
  clearLedgerSession,
  ledgerSignInMessage,
  readLedgerSession,
  writeLedgerSession,
  type LedgerSession,
} from '@/lib/ledger-session'

export function useLedgerSession() {
  const { requestApproval, phase, reason, reset } = useLedgerApproval()
  const [session, setSession] = useState<LedgerSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Device sessions only. A local Anvil marker is not a Nano sign-in.
  useEffect(() => {
    const sync = () => {
      const m = readLedgerSession()
      setSession(m?.kind === 'ledger' ? m : null)
    }
    sync()
    window.addEventListener('wave-ledger-session', sync)
    return () => window.removeEventListener('wave-ledger-session', sync)
  }, [])

  const signIn = useCallback(async (): Promise<LedgerSession | null> => {
    setError(null)
    const result = await requestApproval({ message: ledgerSignInMessage() })
    if (result.status !== 'approved' || !result.address) {
      setError(result.reason ?? 'Ledger sign-in did not complete')
      return null
    }
    const s = writeLedgerSession(result.address)
    setSession(s)
    return s
  }, [requestApproval])

  const signOut = useCallback(() => {
    clearLedgerSession()
    setSession(null)
    reset()
  }, [reset])

  return {
    session,
    /** The DMK device phase while signing in ('sign-on-device', …). */
    phase,
    error,
    signIn,
    signOut,
  }
}
