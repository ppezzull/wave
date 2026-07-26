'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { profiles, currentUser } from '@/lib/mock-data'

function WhoToFollowRow({
  handle,
  name,
  followers,
}: {
  handle: string
  name: string
  followers: number
}) {
  const [following, setFollowing] = useState(false)
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-wave-surface transition-colors">
      <Link href={`/u/${handle}`} className="shrink-0" aria-label={`View ${name}`}>
        <div
          className="w-10 h-10 rounded-full"
          style={{ background: 'linear-gradient(135deg, #2A9D8F, #0F3460)' }}
          aria-hidden="true"
        />
      </Link>
      <Link href={`/u/${handle}`} className="flex flex-col min-w-0 flex-1 leading-tight">
        <span className="font-mono text-[14px] text-wave-text truncate">{name}</span>
        <span className="font-sans text-[13px] text-wave-muted">
          {followers.toLocaleString()} followers
        </span>
      </Link>
      <button
        onClick={() => setFollowing((f) => !f)}
        className={`shrink-0 px-4 h-8 rounded-full font-sans text-[13px] font-bold transition-colors border ${
          following
            ? 'bg-transparent text-wave-text border-wave-border'
            : 'bg-wave-inverted text-wave-bg border-transparent'
        }`}
        aria-pressed={following}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </div>
  )
}

export function RightColumn() {
  const suggestions = profiles.filter((p) => p.handle !== currentUser.handle).slice(0, 4)

  return (
    <aside
      className="hidden lg:flex w-[350px] shrink-0 flex-col gap-4 pl-8 py-3 pr-4 sticky top-0 h-screen overflow-y-auto"
      aria-label="Discovery"
    >
      {/* Search */}
      <div className="sticky top-0 z-10 bg-wave-bg pb-1">
        <div className="flex items-center gap-3 rounded-full px-4 h-11 bg-wave-surface border border-transparent focus-within:border-wave-teal focus-within:bg-wave-bg transition-colors">
          <Search size={18} className="text-wave-muted shrink-0" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search strategies"
            className="flex-1 min-w-0 bg-transparent outline-none font-sans text-[15px] text-wave-text placeholder:text-wave-muted"
            aria-label="Search strategies"
          />
        </div>
      </div>

      {/* Who to follow */}
      <section className="rounded-2xl border border-wave-border overflow-hidden">
        <h2 className="font-sans font-extrabold text-[1.25rem] text-wave-text px-4 pt-3 pb-1">
          Who to follow
        </h2>
        <div>
          {suggestions.map((p) => (
            <WhoToFollowRow
              key={p.handle}
              handle={p.handle}
              name={p.name}
              followers={p.followersCount}
            />
          ))}
        </div>
        <Link
          href="/explore"
          className="block px-4 py-3 font-sans text-[15px] hover:bg-wave-surface transition-colors"
          style={{ color: '#2A9D8F' }}
        >
          Show more
        </Link>
      </section>

      {/* Attribution */}
      <p className="px-4 font-sans text-[12px] text-wave-muted leading-relaxed">
        Powered by SwapVM &middot; Flavio, Pietro &amp; Flaviano &middot; 2026
      </p>
    </aside>
  )
}
