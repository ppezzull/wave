'use client'

// useSessionUser — identity from resolveSession (lib/session.ts).
// Order is Privy → Ledger device → local Anvil → none. Do not re-check
// those doors in callers; read `source` and the sign helpers.
import { useEffect, useRef, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { identityFromAddress, type Identity } from '@/lib/identity'
import { readLedgerSession } from '@/lib/ledger-session'
import { syncSessionCookie } from '@/app/actions/session'
import {
  resolveSession,
  type SessionMarker,
  type SessionSource,
} from '@/lib/session'

export type SessionUser = Identity
export type { SessionSource }

export function useSessionUser(): {
  sessionUser: SessionUser | null
  ready: boolean
  authenticated: boolean
  source: SessionSource
} {
  const { ready: privyReady, authenticated: privyAuthenticated } = usePrivy()
  const { wallets } = useWallets()
  const privyAddress = wallets[0]?.address

  const [hydrated, setHydrated] = useState(false)
  const [marker, setMarker] = useState<SessionMarker | null>(null)
  useEffect(() => {
    const sync = () => setMarker(readLedgerSession())
    sync()
    setHydrated(true)
    window.addEventListener('wave-ledger-session', sync)
    return () => window.removeEventListener('wave-ledger-session', sync)
  }, [])

  const snap = resolveSession({
    privyReady,
    privyAuthenticated,
    privyAddress,
    markerHydrated: hydrated,
    marker,
  })

  // Mirror into the SSR cookie once. Next navigation runs wallet-keyed
  // reads on the server (similar feed, threads, vault) instead of a hook.
  const cookieKey = useRef('')
  useEffect(() => {
    if (!snap.ready) return
    const next =
      snap.authenticated && snap.address && snap.source
        ? JSON.stringify({ address: snap.address, source: snap.source })
        : ''
    if (next === cookieKey.current) return
    cookieKey.current = next
    void syncSessionCookie(next ? (JSON.parse(next) as { address: string; source: Exclude<SessionSource, null> }) : null)
  }, [snap.ready, snap.authenticated, snap.address, snap.source])

  return {
    sessionUser: snap.address ? identityFromAddress(snap.address) : null,
    ready: snap.ready,
    authenticated: snap.authenticated,
    source: snap.source,
  }
}
