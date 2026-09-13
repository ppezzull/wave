'use client'

// ConnectButton — login/logout from useSessionUser. Do not read localStorage
// here; the ordered split lives in lib/session.ts.
import { usePrivy } from '@privy-io/react-auth'
import { LogOut } from 'lucide-react'
import { useSessionUser } from '@/hooks/use-session-user'
import { clearLedgerSession } from '@/lib/ledger-session'

export function ConnectButton({ collapsed = false }: { collapsed?: boolean }) {
  const { logout } = usePrivy()
  const { ready, authenticated, source } = useSessionUser()
  if (!ready) return null

  if (authenticated) {
    const onLogout = () => {
      clearLedgerSession()
      if (source === 'privy') void logout()
      else window.location.assign('/')
    }
    return (
      <button
        type="button"
        onClick={onLogout}
        className="flex items-center justify-center rounded-full transition-colors hover:bg-wave-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal w-10 h-10 shrink-0"
        style={{ color: '#E5484D' }}
        aria-label="Log out"
        title="Log out"
      >
        <LogOut size={collapsed ? 20 : 18} strokeWidth={1.9} aria-hidden="true" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => window.location.assign('/')}
      className={`flex items-center justify-center rounded-full font-sans text-[14px] font-bold text-white shadow-sm transition-all duration-[220ms] hover:brightness-110 active:scale-[0.98] ${
        collapsed ? 'w-12 h-12' : 'w-full px-4 py-2.5'
      }`}
      style={{
        background: 'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)',
      }}
      aria-label="Connect wallet"
    >
      {collapsed ? '_eth' : 'Connect wallet'}
    </button>
  )
}
