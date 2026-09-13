'use client'

// Landing sign-in — three doors, one session:
//   1. Privy wallet
//   2. Ledger device (DMK/WebHID)
//   3. Local Anvil account (browse-only)
// Identity comes from useSessionUser. Do not re-check Privy vs localStorage.
import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import { useSessionUser } from '@/hooks/use-session-user'
import { useLedgerSession } from '@/hooks/use-ledger-session'
import { clearLedgerSession, writeLocalSession } from '@/lib/ledger-session'
import { LOCAL_ACCOUNT } from '@/lib/session'
import { MicroSkeleton } from '@/components/skeleton'
import { GenericAvatar } from '@/components/generic-avatar'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

function WalletIcon() {
  return (
    <svg
      width={18}
      height={18}
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

function LedgerIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      aria-hidden="true"
    >
      <path d="M4 12V8a4 4 0 0 1 4-4h4" />
      <path d="M20 4h4a4 4 0 0 1 4 4v4" />
      <path d="M4 20v4a4 4 0 0 0 4 4h4" />
      <path d="M28 20v4a4 4 0 0 1-4 4h-4" />
      <path d="M12 11v9h9" />
    </svg>
  )
}

function short(addr: string): string {
  return addr.length >= 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

function SignedInPanel({
  label,
  address,
  caption,
  onLogout,
}: {
  label: string
  address: string
  caption?: string
  onLogout: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[12px] border border-wave-border bg-wave-surface/60 px-4 py-3">
        <GenericAvatar size={44} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-mono text-[15px] font-semibold text-wave-text">
            {label}
          </p>
          <p className="truncate font-mono text-[13px] text-wave-muted">
            {short(address)}
          </p>
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
        onClick={onLogout}
        className="glass-btn flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-[15px] font-semibold text-wave-text"
      >
        Log out
      </button>

      {caption && (
        <p className="text-center font-sans text-[12px] text-wave-muted">{caption}</p>
      )}
    </div>
  )
}

export function LandingSignIn() {
  const { login, connectWallet, logout } = usePrivy()
  const { sessionUser, source, ready, authenticated } = useSessionUser()
  const ledger = useLedgerSession()

  const handleWallet = () => {
    if (typeof login === 'function') void login()
    else void connectWallet()
  }

  const handleLedger = () => {
    void ledger.signIn()
  }

  const handleLocal = () => {
    writeLocalSession(LOCAL_ACCOUNT)
  }

  const handleLogout = () => {
    clearLedgerSession()
    if (source === 'privy') void logout()
  }

  if (!ready) {
    return (
      <MicroSkeleton label="Loading sign-in" className="px-0 py-1">
        <div className="flex h-[52px] w-full items-center justify-center rounded-[10px]">
          <span className="font-sans text-[15px] font-semibold text-wave-text">
            Loading
          </span>
        </div>
      </MicroSkeleton>
    )
  }

  if (authenticated && sessionUser) {
    const caption =
      source === 'ledger'
        ? 'Signed in with your Ledger device'
        : source === 'local'
          ? 'Local account — browse only'
          : undefined
    return (
      <SignedInPanel
        label={sessionUser.handle}
        address={sessionUser.address}
        caption={caption}
        onLogout={handleLogout}
      />
    )
  }

  const phaseLabel =
    ledger.phase === 'connecting'
      ? 'Opening device picker…'
      : ledger.phase === 'ready-on-device' || ledger.phase === 'app-opening'
        ? 'Confirm on your Ledger…'
        : ledger.phase === 'sign-on-device'
          ? 'Signing on device…'
          : 'Sign in with Ledger'

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
      <button
        type="button"
        onClick={handleLedger}
        disabled={
          ledger.phase === 'connecting' ||
          ledger.phase === 'sign-on-device' ||
          ledger.phase === 'app-opening' ||
          ledger.phase === 'ready-on-device'
        }
        className="glass-btn flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-[15px] font-semibold text-wave-text disabled:opacity-70"
      >
        <LedgerIcon />
        {phaseLabel}
      </button>
      <button
        type="button"
        onClick={handleLocal}
        className="flex min-h-[44px] w-full items-center justify-center font-sans text-[13px] font-semibold text-wave-muted transition-colors hover:text-wave-text"
      >
        Continue with local account
      </button>
      {(ledger.error || ledger.phase === 'rejected') && (
        <p className="text-center font-sans text-[12px]" style={{ color: '#E5484D' }} role="alert">
          {ledger.error ?? 'Device sign-in was declined.'}
        </p>
      )}
    </div>
  )
}
