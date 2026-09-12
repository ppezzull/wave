'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Strategy } from '@/lib/data'
import { StrategyCard } from '@/components/strategy-card'
import { Footer } from '@/components/footer'
import { useSessionUser } from '@/hooks/use-session-user'
import { similarFeed, type SimilarMatch } from '@/app/actions/feed'

type Tab = 'foryou' | 'new'

interface Props {
  ranked: Strategy[]
  unranked: Strategy[]
}

// Tab toggle is pure client state; the strategy arrays are server-resolved.
// "For you" = REAL similarity: once the session wallet resolves, the server
// ranks every described strategy by TF-IDF-cosine against the wallet's OWN
// deployed descriptions (lib/similarity.ts) — matches (with a % badge) come
// first, then the leaderboard tail. No wallet / nothing deployed yet → the
// honest fallback (unranked then ranked) with a hint, never a fake ranking.
// "New": only the unranked strategies, newest activity first.
export function ExploreFeed({ ranked, unranked }: Props) {
  const [tab, setTab] = useState<Tab>('foryou')
  const { sessionUser } = useSessionUser()
  const [matches, setMatches] = useState<SimilarMatch[] | null>(null)
  const [matchFailed, setMatchFailed] = useState(false)
  const address = sessionUser?.address

  useEffect(() => {
    if (!address) return
    let cancelled = false
    setMatches(null)
    setMatchFailed(false)
    void similarFeed(address)
      .then((m) => {
        if (!cancelled) setMatches(m)
      })
      .catch(() => {
        if (!cancelled) setMatchFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  const matchedIds = useMemo(
    () => new Set((matches ?? []).map((m) => m.strategy.id)),
    [matches],
  )
  const matchPctById = useMemo(
    () => new Map((matches ?? []).map((m) => [m.strategy.id, m.matchPct])),
    [matches],
  )
  const tail = useMemo(
    () =>
      [...unranked, ...ranked].filter((s) => !matchedIds.has(s.id)),
    [unranked, ranked, matchedIds],
  )

  const showMatched = tab === 'foryou' && matches !== null && matches.length > 0
  const showHint =
    tab === 'foryou' &&
    !matchFailed &&
    (matches === null || matches.length === 0) &&
    !!address

  const feed = useMemo<Strategy[]>(() => {
    if (showMatched) return [...(matches ?? []).map((m) => m.strategy), ...tail]
    if (tab === 'foryou') return [...unranked, ...ranked]
    return [...unranked].sort((a, b) => b.lastSwapTimestamp - a.lastSwapTimestamp)
  }, [showMatched, matches, tail, tab, ranked, unranked])

  return (
    <>
      {/* Sticky feed header with tabs */}
      <header className="sticky top-12 md:top-0 z-30 bg-wave-bg/85 backdrop-blur-md border-b border-wave-border">
        <div className="flex items-center h-14 px-4">
          <h1 className="font-sans font-bold text-[1.25rem] text-wave-text">
            Explore
          </h1>
        </div>
        <div className="flex" role="tablist" aria-label="Feed views">
          <button
            role="tab"
            aria-selected={tab === 'foryou'}
            onClick={() => setTab('foryou')}
            className={`flex-1 relative py-3.5 font-sans text-[15px] hover:bg-wave-surface transition-colors ${
              tab === 'foryou' ? 'font-bold text-wave-text' : 'font-normal text-wave-muted'
            }`}
          >
            For you
            {tab === 'foryou' && (
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 rounded-full"
                style={{ background: '#2A9D8F' }}
                aria-hidden="true"
              />
            )}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'new'}
            onClick={() => setTab('new')}
            className={`flex-1 relative py-3.5 font-sans text-[15px] hover:bg-wave-surface transition-colors ${
              tab === 'new' ? 'font-bold text-wave-text' : 'font-normal text-wave-muted'
            }`}
          >
            New
            {tab === 'new' && (
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 rounded-full"
                style={{ background: '#2A9D8F' }}
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </header>

      {/* Feed */}
      <section className="flex-1" aria-label="Strategy feed">
        {showHint && (
          <p className="px-4 py-3 font-sans text-[13px] text-wave-muted border-b border-wave-border">
            For you ranks the feed by similarity to the strategies you deploy —
            ship one and matches appear here.
          </p>
        )}
        {feed.length > 0 ? (
          feed.map((s) => (
            <StrategyCard key={s.id} strategy={s} matchPct={matchPctById.get(s.id)} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
            <p className="font-sans text-[15px] text-wave-muted">
              No strategies yet. Ship the first one.
            </p>
          </div>
        )}
      </section>

      <Footer />
    </>
  )
}
