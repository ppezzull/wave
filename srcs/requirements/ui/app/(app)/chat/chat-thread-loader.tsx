'use client'

// Live /chat: threads are the session wallet's shipped strategies (its on-chain
// authorships). The wallet resolves client-side (Privy), so this loader fetches
// after it appears — never a fabricated list, never a fallback to ALL strategies.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSessionUser } from '@/hooks/use-session-user'
import { ConnectButton } from '@/components/connect-button'
import { Footer } from '@/components/footer'
import { listThreads } from '@/app/actions/threads'
import type { Strategy } from '@/lib/data'
import { ChatThreads } from './chat-threads'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

function ThreadSkeleton() {
  return (
    <>
      <header className="sticky top-12 md:top-0 z-30 bg-wave-bg/85 backdrop-blur-md border-b border-wave-border px-4 py-2.5">
        <h1 className="font-sans font-bold text-[1.25rem] text-wave-text">Chat</h1>
      </header>
      <div className="flex-1 animate-pulse px-4 py-4 space-y-3">
        <div className="h-16 rounded-lg bg-wave-surface" />
        <div className="h-16 rounded-lg bg-wave-surface" />
        <div className="h-16 rounded-lg bg-wave-surface" />
      </div>
      <Footer />
    </>
  )
}

export function ChatThreadLoader() {
  const { sessionUser, ready } = useSessionUser()
  const [threads, setThreads] = useState<Strategy[] | null>(null)
  const address = sessionUser?.address

  useEffect(() => {
    if (!address) return
    let cancelled = false
    setThreads(null) // wallet changed → reload skeleton, never show stale threads
    void listThreads(address).then((rows) => {
      if (!cancelled) setThreads(rows)
    })
    return () => {
      cancelled = true
    }
  }, [address])

  // Privy still resolving → skeleton (no flash of "connect" for logged-in users).
  if (!ready) return <ThreadSkeleton />

  // Disconnected → honest empty + connect. No fabricated threads.
  if (!sessionUser) {
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-sans text-[15px] text-wave-muted">
            Connect your wallet to see your strategy threads.
          </p>
          <ConnectButton />
        </div>
        <Footer />
      </>
    )
  }

  if (threads === null) return <ThreadSkeleton />

  // A wallet with no ships has no threads — the CTA is compose, NOT a fallback
  // to every strategy on the feed (that would fabricate ownership).
  if (threads.length === 0) {
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-sans text-[15px] text-wave-muted">
            No strategies yet — ship your first one and it becomes a thread here.
          </p>
          <Link
            href="/compose"
            className="flex items-center gap-1.5 rounded-full px-4 py-2 font-sans text-[14px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: LISBOA }}
          >
            Compose a strategy
          </Link>
        </div>
        <Footer />
      </>
    )
  }

  return <ChatThreads threads={threads} />
}
