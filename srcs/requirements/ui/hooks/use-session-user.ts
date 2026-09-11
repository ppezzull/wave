'use client'

// useSessionUser — the real wallet identity from the Privy session.
//
// Returns the connected wallet's Identity (lib/identity.ts seam) when the user
// is authenticated, or null when disconnected/not ready. This is the live
// counterpart to the server getCurrentUser() stub: ship/create flows and the
// account chip read this so identity comes from the actual connected wallet,
// never a fabricated value.
//
// Trust layer: Ledger Continuity — hardware approval lives on the agent's HITL
// gate (LEDGER_GATE), not on the session identity. The seam stays offline:
// truncated handle, verifiedHuman false until a trust resolver returns.
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { identityFromAddress, type Identity } from '@/lib/identity'

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

  if (!ready || !authenticated || !connected) {
    return { sessionUser: null, ready, authenticated }
  }
  return {
    sessionUser: identityFromAddress(connected),
    ready,
    authenticated,
  }
}
