'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  strategies,
  rankedStrategies,
  unrankedStrategies,
} from '@/lib/mock-data'
import { StrategyCard } from '@/components/strategy-card'
import { Footer } from '@/components/footer'

// ids of the strategies the signed-in user follows (for the Following tab).
const FOLLOWED_IDS = [strategies[0].id, strategies[3].id, strategies[1].id]

type Tab = 'foryou' | 'following'

export default function ExplorePage() {
  const [tab, setTab] = useState<Tab>('foryou')

  // "For you": unranked (new / low-fill) float to the top, then ranked.
  const forYou = [...unrankedStrategies(), ...rankedStrategies()]
  // "Following": only strategies the user follows, newest activity first.
  const following = strategies
    .filter((s) => FOLLOWED_IDS.includes(s.id))
    .sort((a, b) => b.lastSwapTimestamp - a.lastSwapTimestamp)

  const feed = tab === 'foryou' ? forYou : following

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
            aria-selected={tab === 'following'}
            onClick={() => setTab('following')}
            className={`flex-1 relative py-3.5 font-sans text-[15px] hover:bg-wave-surface transition-colors ${
              tab === 'following' ? 'font-bold text-wave-text' : 'font-normal text-wave-muted'
            }`}
          >
            Following
            {tab === 'following' && (
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
        {feed.length > 0 ? (
          feed.map((s) => <StrategyCard key={s.id} strategy={s} />)
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
            <p className="font-sans text-[15px] text-wave-muted">
              You&apos;re not following any strategies yet.
            </p>
            <Link
              href="/follow"
              className="font-sans text-[14px] font-semibold underline underline-offset-4 text-wave-text hover:text-wave-muted transition-colors"
            >
              Find strategies to follow
            </Link>
          </div>
        )}
      </section>

      <Footer />
    </>
  )
}
