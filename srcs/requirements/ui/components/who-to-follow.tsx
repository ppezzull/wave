// Who to follow — restored as REAL data: the active network's top authors
// (fills then strategy count, from the same subgraph rows the feed renders).
// Names show the ENS name (or subdomain) when the address carries a reverse
// record on this network's ENS; otherwise the honest truncated address. Rows
// link to profiles — no follow button until a follow backend exists (the
// ENS-text-record follow graph was removed at continuity; a fake button
// would be worse than none).
import Link from 'next/link'
import { AuthorAvatar } from './generic-avatar'
import { getTopAuthors } from '@/lib/data/server'

export async function WhoToFollow() {
  const authors = await getTopAuthors(3).catch(() => [])
  if (authors.length === 0) return null
  return (
    <section
      className="glass-surface rounded-[16px] border border-wave-border p-4"
      aria-labelledby="who-to-follow-heading"
    >
      <h2
        id="who-to-follow-heading"
        className="font-sans font-bold text-[17px] text-wave-text mb-1"
      >
        Who to follow
      </h2>
      <ul className="flex flex-col">
        {authors.map((a) => (
          <li key={a.address}>
            <Link
              href={`/u/${a.address}`}
              className="flex items-center gap-3 py-3 hover:bg-wave-surface/60 transition-colors rounded-[10px]"
              aria-label={`${a.label}, ${a.strategies} strategies, ${a.fills} fills`}
            >
              <AuthorAvatar url={a.avatarUrl} size={40} />
              <span className="flex flex-col min-w-0 flex-1">
                <span className="font-mono text-[14px] font-semibold text-wave-text truncate">
                  {a.label}
                </span>
                <span className="font-sans text-[12px] text-wave-muted">
                  {a.strategies} {a.strategies === 1 ? 'strategy' : 'strategies'} ·{' '}
                  {a.fills} {a.fills === 1 ? 'fill' : 'fills'}
                </span>
              </span>
              <span
                className="font-sans text-[13px] font-semibold shrink-0"
                style={{ color: '#2A9D8F' }}
              >
                View
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
