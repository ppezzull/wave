'use client'

// Privy provider wrapper — the single client boundary for auth/wallet.
//
// Sepolia ONLY (hackathon testnet): EnsStrategyRouter (post-#49 redeploy),
// Aqua, and Studio subgraph wave v0.0.4 are all Sepolia.
// defaultChain + supportedChains both pinned to sepolia so Privy never prompts
// for another network. The app id is a PUBLIC client identifier (Privy app ids
// are meant to ship in the bundle), so NEXT_PUBLIC_ is correct here.
import { PrivyProvider } from '@privy-io/react-auth'
import { sepolia } from 'viem/chains'
import type { ReactNode } from 'react'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID

export function Providers({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    // No app id configured → render the app anyway (auth features degrade to
    // "disconnected"); never crash the whole UI over a missing env.
    console.warn('NEXT_PUBLIC_PRIVY_APP_ID is not set — wallet features disabled.')
    return <>{children}</>
  }
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        defaultChain: sepolia,
        supportedChains: [sepolia],
      }}
    >
      {children}
    </PrivyProvider>
  )
}
