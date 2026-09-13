'use client'

// RequireSession — the inverse of the public feed: these pages are
// account-only surfaces (Settings, the chat selector). Signed-out visitors
// are sent to `/` — the landing owns both auth doors. Waits for the session
// to resolve (Privy ready + ledger localStorage) so a signed-in user never
// bounces during hydration: a Privy user can be `authenticated` a beat
// BEFORE `wallets[0]` reconnects — that user is IN, not out.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionUser } from '@/hooks/use-session-user'

export function RequireSession({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, sessionUser } = useSessionUser()
  const router = useRouter()

  useEffect(() => {
    if (ready && !authenticated && !sessionUser) router.replace('/')
  }, [ready, authenticated, sessionUser, router])

  if (!ready || (!authenticated && !sessionUser)) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center font-sans text-[15px] text-wave-muted"
        aria-busy="true"
      >
        Redirecting…
      </div>
    )
  }

  // Authenticated with the wallet still reconnecting — hold the door, the
  // content renders the moment sessionUser resolves.
  if (!sessionUser) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center font-sans text-[15px] text-wave-muted"
        aria-busy="true"
      >
        Restoring your session…
      </div>
    )
  }

  return <>{children}</>
}
