'use client'

// New-activity pill — the explore feed's live edge. The page renders with a
// feed signature (lib/feed-pulse); this component re-checks it every 15s
// (paused while the tab is hidden, immediate on return). A changed signature
// means something real moved on-chain — a ship, a fill, the What's-new tags —
// and the pill offers the refresh (router.refresh() re-renders the whole
// route: feed AND rail). Never auto-refreshes: the reader decides when their
// timeline moves. X-style, deliberately.
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp } from 'lucide-react'
import { feedPulse } from '@/app/actions/feed'

const POLL_MS = 15_000

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

export function NewActivityBanner({ sig }: { sig: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const known = useRef(sig)
  const [stale, setStale] = useState(false)

  // A completed router.refresh() re-renders this component with the NEW sig —
  // adopt it and stand down (same follow-the-server-prop as the rail switcher).
  useEffect(() => {
    known.current = sig
    setStale(false)
  }, [sig])

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const now = await feedPulse()
        // '' = no signal (subgraph unreachable / empty) — never a "new stuff" claim.
        if (alive && now && now !== known.current) setStale(true)
      } catch {
        // poll failures are invisible — never nag
      }
    }
    const id = setInterval(() => {
      if (!document.hidden) void check()
    }, POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!stale) return null

  return (
    <div
      className="sticky top-12 z-20 flex justify-center bg-wave-bg/85 px-4 pb-2 pt-2 backdrop-blur-md md:top-0"
      role="status"
      aria-live="polite"
    >
      <button
        onClick={() => {
          setStale(false)
          startTransition(() => router.refresh())
        }}
        className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-[13px] font-semibold text-white shadow-md transition-all hover:brightness-110 active:scale-[0.98]"
        style={{ background: LISBOA }}
        aria-label="New on-chain activity detected — refresh the feed"
      >
        <ArrowUp size={14} aria-hidden="true" />
        New activity — refresh
      </button>
    </div>
  )
}
