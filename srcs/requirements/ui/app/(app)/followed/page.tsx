import { strategies } from '@/lib/mock-data'
import { StrategyCard } from '@/components/strategy-card'
import { Footer } from '@/components/footer'

// ids of strategies by users who follow the signed-in user: marina, 0xdefi.
const FOLLOWER_IDS = [strategies[4].id, strategies[2].id]

export default function FollowedPage() {
  const byFollowers = strategies.filter((s) => FOLLOWER_IDS.includes(s.id))

  return (
    <>
      {/* Sticky header */}
      <header className="sticky top-12 md:top-0 z-30 bg-wave-bg/85 backdrop-blur-md border-b border-wave-border px-4 py-2.5">
        <h1 className="font-sans font-bold text-[1.25rem] text-wave-text">
          Followed
        </h1>
        <p className="font-sans text-[13px] text-wave-muted">
          Strategies by people who follow you.
        </p>
      </header>

      {/* Feed */}
      <section className="flex-1" aria-label="Feed from followers">
        {byFollowers.length > 0 ? (
          byFollowers.map((s) => <StrategyCard key={s.id} strategy={s} />)
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
            <p className="font-sans text-[15px] text-wave-muted">
              No one is following you yet. Ship strategies to build your audience.
            </p>
          </div>
        )}
      </section>

      <Footer />
    </>
  )
}
