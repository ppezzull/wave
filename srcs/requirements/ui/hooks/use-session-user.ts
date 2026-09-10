'use client'

// useSessionUser — the real wallet identity from the Privy session.
//
// Returns the connected wallet's Identity (lib/identity.ts seam) when the user
// is authenticated, or null when disconnected/not ready. This is the live
// counterpart to the server getCurrentUser() stub: ship/create flows and the
// account chip read this so identity comes from the actual connected wallet,
// never a fabricated value.
//
// World AgentKit (Fase 1, Step 4): the seam's offline half (truncated handle)
// is immediate; verifiedHuman/humanId resolve asynchronously through the
// getWorldIdentity server action (AgentBook lookup, server-only). The badge
// appears once resolution lands — graceful, no hydration flash.
import { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { identityFromAddress, type Identity } from '@/lib/identity'
import { getWorldIdentity } from '@/app/actions/identity'

/** The connected wallet's identity via the seam. */
export type SessionUser = Identity

export function useSessionUser(): {
  sessionUser: SessionUser | null
  ready: boolean
  authenticated: boolean
} {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const connected = wallets[0]?.address

  const [world, setWorld] = useState<Pick<Identity, 'verifiedHuman' | 'humanId'> | null>(null)

  useEffect(() => {
    if (!connected) {
      setWorld(null)
      return
    }
    let live = true
    getWorldIdentity(connected)
      .then((r) => {
        if (live) setWorld({ verifiedHuman: r.verifiedHuman, humanId: r.humanId })
      })
      .catch(() => {
        /* resolver never throws in practice; a hard failure keeps offline identity */
      })
    return () => {
      live = false
    }
  }, [connected])

  if (!ready || !authenticated || !connected) {
    return { sessionUser: null, ready, authenticated }
  }
  return {
    sessionUser: { ...identityFromAddress(connected), ...(world ?? {}) },
    ready,
    authenticated,
  }
}
