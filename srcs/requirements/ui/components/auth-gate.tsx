'use client'

// AuthGate — signed-out users cannot stay in the app shell; send them to `/`.
// Waits for Privy `ready` so we don't bounce before the session hydrates.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy()
  const router = useRouter()

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace('/')
    }
  }, [ready, authenticated, router])

  if (!ready) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-wave-bg font-sans text-[15px] text-wave-muted"
        aria-busy="true"
      >
        Loading…
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-wave-bg font-sans text-[15px] text-wave-muted"
        aria-busy="true"
      >
        Redirecting…
      </div>
    )
  }

  return <>{children}</>
}
