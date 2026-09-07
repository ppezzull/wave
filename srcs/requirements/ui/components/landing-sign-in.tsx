'use client'

// Landing sign-in — Privy wallet connect (frontend.md §2).
// Signed-out: Sign in CTA. Signed-in: stay on `/` and show identity + Privy logout
// in the right panel (do NOT redirect to /explore — that was the bug).
import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import { useSessionUser } from '@/hooks/use-session-user'

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

function short(addr: string): string {
  return addr.length >= 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

export function LandingSignIn() {
  const { ready, authenticated, login, connectWallet, logout } = usePrivy()
  const { sessionUser } = useSessionUser()

  const handleWallet = () => {
    // Prefer full Privy login modal (email/wallet); fall back to connectWallet.
    if (typeof login === 'function') void login()
    else void connectWallet()
  }

  const handleLogout = () => {
    void logout()
  }

  // Privy still booting — avoid a sign-in flash for already-authed sessions.
  if (!ready) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <div className="flex min-h-[52px] w-full items-center justify-center rounded-[10px] bg-wave-surface font-sans text-[15px] text-wave-muted">
          Loading…
        </div>
      </div>
    )
  }

  // Authed: show identity on the right panel + Enter app + Log out (Privy).
  if (authenticated) {
    const address = sessionUser?.walletAddress
    const label = sessionUser?.ensName ?? (address ? short(address) : 'Connected')
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-[12px] border border-wave-border bg-wave-surface/60 px-4 py-3">
          <div
            className="h-11 w-11 shrink-0 rounded-full"
            style={{ background: 'linear-gradient(135deg, #2A9D8F, #0F3460)' }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-mono text-[15px] font-semibold text-wave-text">
              {label}
            </p>
            {address && (
              <p className="truncate font-mono text-[13px] text-wave-muted">
                {short(address)}
              </p>
            )}
          </div>
        </div>

        <Link
          href="/explore"
          className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-[15px] font-semibold text-white transition-all duration-[220ms] hover:brightness-[1.05] hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: LISBOA }}
        >
          Enter app
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="glass-btn flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-[15px] font-semibold text-wave-text"
        >
          Log out
        </button>

        <p className="text-center font-sans text-[12px] text-wave-muted">
          Sepolia only · likes are liquidity
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleWallet}
        className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-[15px] font-semibold text-white transition-all duration-[220ms] hover:brightness-[1.05] hover:scale-[1.01] active:scale-[0.99]"
        style={{ background: LISBOA }}
      >
        <WalletIcon />
        Sign in with wallet
      </button>
      <p className="text-center font-sans text-[12px] text-wave-muted">
        Sepolia only · likes are liquidity
      </p>
    </div>
  )
}
