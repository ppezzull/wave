import Link from 'next/link'
import { strategies } from '@/lib/mock-data'
import { StrategyCard } from '@/components/strategy-card'
import { Footer } from '@/components/footer'

// ids of the strategies the signed-in user (alice) follows:
// alice's momentum, quant's breakout, vitalik's range.
const FOLLOWED_IDS = [strategies[0].id, strategies[3].id, strategies[1].id]

export default function FollowPage() {
  const followed = strategies.filter((s) => FOLLOWED_IDS.includes(s.id))

  return (
    <>
      {/* Sticky header */}
      <header className="sticky top-12 md:top-0 z-30 bg-wave-bg/85 backdrop-blur-md border-b border-wave-border px-4 py-2.5">
        <h1 className="font-sans font-bold text-[1.25rem] text-wave-text">
          Follow
        </h1>
        <p className="font-sans text-[13px] text-wave-muted">
          Strategies you follow, live.
        </p>
      </header>

      {/* Feed */}
      <section className="flex-1" aria-label="Followed strategies feed">
        {followed.length > 0 ? (
          followed.map((s) => <StrategyCard key={s.id} strategy={s} />)
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
            <p className="font-sans text-[15px] text-wave-muted">
              No followed strategies yet. Explore the feed to follow strategies.
            </p>
            <Link
              href="/explore"
              className="font-sans text-[14px] font-semibold text-wave-text underline underline-offset-4 hover:text-wave-muted transition-colors"
            >
              Go to Explore
            </Link>
          </div>
        )}
      </section>

      <Footer />
    </>
  )
}
