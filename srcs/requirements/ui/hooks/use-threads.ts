'use client'

// The wallet's conversations — its shipped strategies (on-chain authorships),
// fetched via the listThreads server action once Privy resolves the address.
// Shared by the /chat selector page and the widget's conversation sidebar.
// Never fabricated, never a fallback to ALL strategies (that would invent
// ownership); honest connect/loading/empty states live at the call sites.
import { useEffect, useState } from 'react'
import { useSessionUser } from '@/hooks/use-session-user'
import { listThreads } from '@/app/actions/threads'
import type { Strategy } from '@/lib/data'

export type ThreadsState =
  | { phase: 'resolving' } // Privy still loading
  | { phase: 'disconnected' } // no wallet
  | { phase: 'loading' } // wallet known, rows fetching
  | { phase: 'ready'; threads: Strategy[] }

export function useThreads(): ThreadsState {
  const { sessionUser, ready } = useSessionUser()
  const [threads, setThreads] = useState<Strategy[] | null>(null)
  const address = sessionUser?.address

  useEffect(() => {
    if (!address) return
    let cancelled = false
    setThreads(null)
    void listThreads(address).then((rows) => {
      if (!cancelled) setThreads(rows)
    })
    return () => {
      cancelled = true
    }
  }, [address])

  if (!ready) return { phase: 'resolving' }
  if (!sessionUser) return { phase: 'disconnected' }
  if (threads === null) return { phase: 'loading' }
  return { phase: 'ready', threads }
}
