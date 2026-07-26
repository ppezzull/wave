'use client'

// useSessionUser — the real wallet identity from the Privy session.
//
// Returns the connected wallet address (and lazily its ENS name) when the user
// is authenticated, or null when disconnected/not ready. This is the live
// counterpart to the server getCurrentUser() stub: ship/create flows and the
// account chip read this so identity comes from the actual connected wallet,
// never a fabricated value.
//
// ENS reverse-lookup is best-effort and client-side only (no server agent call
// wired yet); it degrades to the raw address until the ENS reader lands.
import { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { getEnsName } from 'viem/actions'

export interface SessionUser {
  walletAddress: string
  /** ENS name if reverse-resolved, else null. */
  ensName: string | null
}

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ??
      'https://ethereum-sepolia-rpc.publicnode.com',
  ),
})

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
    // Best-effort reverse lookup; never blocks, never throws into the UI.
    getEnsName(sepoliaClient, { address: connected as `0x${string}` })
      .then((name: string | null) => {
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
