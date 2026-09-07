'use client'

// useSessionUser — the real wallet identity from the Privy session.
//
// Returns the connected wallet address (and lazily its ENS name) when the user
// is authenticated, or null when disconnected/not ready. This is the live
// counterpart to the server getCurrentUser() stub: ship/create flows and the
// account chip read this so identity comes from the actual connected wallet,
// never a fabricated value.
//
// ENS resolution happens server-side via resolveEnsName (app/actions/
// resolve-identity.ts) — reverse record first, forward (owned-name) fallback
// second — so ENS RPC never reaches the browser (frontend.md §8). Best-effort:
// never blocks, never throws into the UI; degrades to the raw address.
import { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { resolveEnsName, claimHandle } from '@/app/actions/resolve-identity'

export interface SessionUser {
  walletAddress: string
  /** ENS name if resolved (reverse or owned-name), else null. */
  ensName: string | null
}

export function useSessionUser(): {
  sessionUser: SessionUser | null
  ready: boolean
  authenticated: boolean
} {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const connected = wallets[0]?.address
  const [ensName, setEnsName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setEnsName(null)
    if (!connected) return
    // Resolve (reverse then owned-name fallback). If the wallet is truly nameless,
    // auto-provision a *.wave.eth subname via the agent so follow has a name to write on.
    // Never blocks, never throws into the UI.
    resolveEnsName(connected)
      .then(async (name) => {
        if (cancelled) return
        if (name) return name
        // Nameless — claim an identity subname (agent-custodied, idempotent).
        return claimHandle(connected)
      })
      .then((name) => {
        if (!cancelled) setEnsName(name ?? null)
      })
      .catch(() => {
        if (!cancelled) setEnsName(null)
      })
    return () => {
      cancelled = true
    }
  }, [connected])

  if (!ready || !authenticated || !connected) {
    return { sessionUser: null, ready, authenticated }
  }
  return {
    sessionUser: { walletAddress: connected, ensName },
    ready,
    authenticated,
  }
}
