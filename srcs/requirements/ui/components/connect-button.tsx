'use client'

// ConnectButton — Privy login/logout. Shown in the left-rail account slot when
// no wallet is connected; once connected the rail renders the account chip with
// the real address + a logout affordance.
//
// `ready` guards render to avoid hydration mismatch (Privy docs pattern).
import { usePrivy } from '@privy-io/react-auth'

export function ConnectButton({ collapsed = false }: { collapsed?: boolean }) {
  const { ready, authenticated, connectWallet, logout } = usePrivy()
  if (!ready) return null

  if (authenticated) {
    return (
      <button
        onClick={() => void logout()}
        className={`rounded-full font-sans text-[14px] font-semibold transition-colors hover:bg-wave-surface ${
          collapsed ? 'p-2 text-wave-muted' : 'px-4 py-2.5 text-wave-muted'
        }`}
        aria-label="Log out"
      >
        {collapsed ? '↩' : 'Log out'}
      </button>
    )
  }

  return (
    <button
      onClick={() => connectWallet()}
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
