'use client'

// Landing sign-in — Privy wallet connect (frontend.md §2). Replaces fake
// /explore links so the judge enters through a real Sepolia session.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

function WalletIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M16 12h.01" />
    </svg>
  )
}

export function LandingSignIn() {
  const router = useRouter()
  const { ready, authenticated, login, connectWallet } = usePrivy()

  useEffect(() => {
    if (ready && authenticated) router.replace('/explore')
  }, [ready, authenticated, router])

  const handleWallet = () => {
    // Prefer full Privy login modal (email/wallet); fall back to connectWallet.
    if (typeof login === 'function') void login()
    else void connectWallet()
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleWallet}
        disabled={!ready}
        className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-[15px] font-semibold text-white transition-all duration-[220ms] hover:brightness-[1.05] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
        style={{ background: LISBOA }}
      >
        <WalletIcon />
        {ready ? 'Sign in with wallet' : 'Loading…'}
      </button>
      <a
        href="/explore"
        className="glass-btn flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-[15px] font-semibold text-wave-text"
      >
        Continue without wallet
      </a>
      <p className="font-sans text-[12px] text-wave-muted text-center">
        Sepolia only · likes are liquidity
      </p>
    </div>
  )
}
