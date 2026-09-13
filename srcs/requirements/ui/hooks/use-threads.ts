'use client'

// The wallet's conversations — its shipped strategies (on-chain authorships).
// Prefer the server-resolved list from /chat. Refetch only when the session
// address does not match that payload (cookie stale / first sign-in).
import { useEffect, useState } from 'react'
import { useSessionUser } from '@/hooks/use-session-user'
import { listThreads } from '@/app/actions/threads'
import type { Strategy } from '@/lib/data'

export type ThreadsState =
  | { phase: 'resolving' }
  | { phase: 'disconnected' }
  | { phase: 'loading' }
  | { phase: 'ready'; threads: Strategy[] }

export interface InitialThreads {
  address: string
  threads: Strategy[]
}

export function useThreads(initial?: InitialThreads): ThreadsState {
  const { sessionUser, ready } = useSessionUser()
  const address = sessionUser?.address
  const [threads, setThreads] = useState<Strategy[] | null>(initial?.threads ?? null)

  useEffect(() => {
    if (!address) return
    if (initial && initial.address.toLowerCase() === address.toLowerCase()) {
      setThreads(initial.threads)
      return
    }
    let cancelled = false
    setThreads(null)
    void listThreads(address).then((rows) => {
      if (!cancelled) setThreads(rows)
    })
    return () => {
      cancelled = true
    }
  }, [address, initial])

  if (!ready) {
    if (initial) return { phase: 'ready', threads: initial.threads }
    return { phase: 'resolving' }
  }
  if (!sessionUser) return { phase: 'disconnected' }
  if (threads === null) return { phase: 'loading' }
  return { phase: 'ready', threads }
}
