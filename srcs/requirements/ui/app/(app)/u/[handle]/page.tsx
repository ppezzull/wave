import Link from 'next/link'
import {
  type Strategy,
  profiles,
  strategyById,
  profileByHandle,
  profileStats,
} from '@/lib/mock-data'
import { StrategyCard } from '@/components/strategy-card'
import { Footer } from '@/components/footer'

export function generateStaticParams() {
  return profiles.map((p) => ({ handle: p.handle }))
}

interface Props {
  params: Promise<{ handle: string }>
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params
  const profile = profileByHandle(handle)

  if (!profile) {
    return (
      <>
        <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
          <h1 className="font-sans font-bold text-[1.5rem] text-wave-text mb-2">
            Profile not found
          </h1>
          <p className="font-sans text-[15px] text-wave-muted mb-6 max-w-sm">
            {`We couldn't find a profile for ${handle}.eth. It may not have shipped a strategy yet.`}
          </p>
          <Link
            href="/explore"
            className="font-sans text-[14px] font-semibold underline underline-offset-4"
            style={{ color: '#2A9D8F' }}
          >
            Back to Explore
          </Link>
        </section>
        <Footer />
      </>
    )
  }

  const profileStrategies = profile.strategyIds
    .map((id) => strategyById(id))
    .filter((s): s is Strategy => Boolean(s))

  // Aggregate stats are computed from the authored strategies, not stored.
  const stats = profileStats(profile)

  return (
    <div className="w-full max-w-[600px] mx-auto border-x border-wave-border min-h-screen flex flex-col">
      {/* Sticky title bar */}
      <header className="sticky top-12 md:top-0 z-30 bg-wave-bg/85 backdrop-blur-md border-b border-wave-border px-4 py-2.5">
        <h1 className="font-mono font-bold text-[1.25rem] text-wave-text truncate">
          {profile.name}
        </h1>
        <p className="font-sans text-[13px] text-wave-muted">
          {profile.strategyIds.length} strategies
        </p>
      </header>

      {/* Profile identity */}
      <section
        className="bg-wave-bg border-b border-wave-border px-4 py-6"
        aria-labelledby="profile-name"
      >
        <div className="w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Avatar — ENS avatar record, or gradient fallback */}
            <div
              className="w-16 h-16 rounded-full shrink-0 overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #2A9D8F, #0F3460)' }}
              aria-hidden="true"
            >
              {profile.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl || '/placeholder.svg'}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* Text block — ENS subdomain only, no display name or bio */}
            <div className="flex flex-col gap-1 min-w-0">
              <h1
                id="profile-name"
                className="font-mono font-bold text-[1.25rem] text-wave-text truncate"
              >
                {profile.name}
              </h1>
              <p
                className="font-mono text-[13px] text-wave-text mt-1"
                aria-label={`${profile.followingCount} following, ${profile.followersCount} followers`}
              >
                {profile.followingCount}
                <span className="font-sans text-[13px] text-wave-muted ml-1 mr-3">
                  following
                </span>
                {profile.followersCount}
                <span className="font-sans text-[13px] text-wave-muted ml-1">
                  followers
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Aggregate stats */}
      <section
        className="bg-wave-surface border-b border-wave-border px-4 py-5"
        aria-label="Profile statistics"
      >
        <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="flex flex-col gap-1">
            <span
              className="font-mono font-bold text-[1.5rem] leading-none"
              style={{ color: stats.totalReturnPositive ? '#1F9D6B' : '#E5484D' }}
              aria-label={`Total return ${stats.totalReturnStr}`}
            >
              {stats.totalReturnStr}
            </span>
            <span className="font-sans text-[12px] text-wave-muted">
              Total Return
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span
              className="font-mono font-bold text-[1.5rem] leading-none text-wave-text"
              aria-label={`${stats.strategiesShipped} strategies shipped`}
            >
              {stats.strategiesShipped}
            </span>
            <span className="font-sans text-[12px] text-wave-muted">
              Strategies Shipped
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span
              className="font-mono font-bold text-[1.5rem] leading-none text-wave-text"
              aria-label={`Total volume ${stats.totalVolume}`}
            >
              {stats.totalVolume}
            </span>
            <span className="font-sans text-[12px] text-wave-muted">
              Total Volume
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span
              className="font-mono font-bold text-[1.5rem] leading-none text-wave-text"
              aria-label={`Average ${stats.avgFills} fills per strategy`}
            >
              {stats.avgFills}
            </span>
            <span className="font-sans text-[12px] text-wave-muted">
              Avg Fills/Strategy
            </span>
          </div>
        </div>
      </section>

      {/* Strategies */}
      <section className="flex-1" aria-labelledby="strategies-label">
        <h2
          id="strategies-label"
          className="font-sans font-semibold text-[1rem] text-wave-text px-4 pt-4 pb-2"
        >
          Strategies
        </h2>
        <div>
          {profileStrategies.map((s) => (
            <StrategyCard key={s.id} strategy={s} />
          ))}
        </div>
      </section>

      <Footer />
    </div>
  )
}
