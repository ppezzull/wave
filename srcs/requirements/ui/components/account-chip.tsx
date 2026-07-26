'use client'

// AccountChip — the left-rail account slot, Privy-aware.
//
// Identity precedence (never fabricated):
//   1. Privy connected wallet (real) — address from useWallets(), ENS name from
//      a best-effort reverse lookup; logout via ConnectButton.
//   2. The server `currentUser` fallback (mock = alice; live stub = empty).
//   3. If neither (live + disconnected) → show ConnectButton.
//
// `handle`/`name` for the profile link: the ENS name if resolved, else the
// server user's handle, else the raw address (which /u/[handle] will render as
// a not-found/empty profile — the honest state).
import Link from 'next/link'
import type { CurrentUser } from './app-wrapper'
import { useSessionUser } from '@/hooks/use-session-user'
import { ConnectButton } from './connect-button'

interface Props {
  currentUser: CurrentUser
  collapsed?: boolean
  onNavClick?: () => void
}

function short(addr: string): string {
  return addr.length >= 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

export function AccountChip({ currentUser, collapsed = false, onNavClick }: Props) {
  const { sessionUser, ready } = useSessionUser()

  // No session and not ready → render nothing (avoids hydration flash).
  if (!ready && !currentUser.walletAddress) return null

  // Disconnected in live mode (no server identity either) → connect CTA.
  if (!sessionUser && !currentUser.walletAddress) {
    return (
      <div className={collapsed ? 'flex justify-center px-2' : 'px-3'}>
        <ConnectButton collapsed={collapsed} />
      </div>
    )
  }

  const address = sessionUser?.walletAddress ?? currentUser.walletAddress
  const name =
    sessionUser?.ensName ??
    (currentUser.name ? currentUser.name : short(address))
  const handle = sessionUser?.ensName?.replace(/\.eth$/, '') ?? currentUser.handle
  const avatarUrl = sessionUser ? '' : currentUser.avatarUrl

  return (
    <div className={collapsed ? 'flex flex-col items-center gap-2 px-2' : 'flex items-center gap-2 px-3'}>
      <Link
        href={`/u/${handle}`}
        onClick={onNavClick}
        className={`flex items-center rounded-full hover:bg-wave-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal ${
          collapsed ? 'justify-center p-1.5' : 'gap-3 p-2.5'
        }`}
        aria-label={`Your profile, ${name}`}
      >
        <div
          className="w-10 h-10 rounded-full shrink-0 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #2A9D8F, #0F3460)' }}
          aria-hidden="true"
        >
          {avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl || '/placeholder.svg'}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="font-mono text-[15px] font-semibold text-wave-text truncate">
              {name}
            </span>
            <span className="font-mono text-[13px] text-wave-muted truncate">
              {short(address)}
            </span>
          </div>
        )}
      </Link>
      {sessionUser && !collapsed && <ConnectButton />}
    </div>
  )
}
