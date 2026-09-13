'use client'

// What's-new tags — presentational. The keyword LIST is fetched on the
// server (RailKeywords); clicks just ask the rail search to run.
import { TrendingUp } from 'lucide-react'

export const WAVE_SEARCH_EVENT = 'wave-search'

export function WhatsNewTags({ keywords }: { keywords: string[] }) {
  if (keywords.length === 0) return null
  return (
    <section
      className="mx-2 rounded-[16px] border border-wave-border glass-surface p-3.5"
      aria-labelledby="whats-new-heading"
    >
      <h2
        id="whats-new-heading"
        className="mb-2.5 flex items-center gap-2 font-sans text-[15px] font-bold text-wave-text"
      >
        <TrendingUp size={15} className="text-wave-teal" aria-hidden="true" />
        What&rsquo;s new
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <button
            key={kw}
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(WAVE_SEARCH_EVENT, { detail: kw }))
              document.getElementById('search-strategies')?.focus()
            }}
            className="rounded-full border border-wave-border px-2.5 py-1 font-sans text-[12px] text-wave-text transition-colors hover:border-wave-teal hover:bg-wave-teal/10 hover:text-wave-teal"
            aria-label={`Search strategies mentioning ${kw}`}
          >
            {kw}
          </button>
        ))}
      </div>
      <p className="mt-2.5 font-sans text-[11px] leading-snug text-wave-muted">
        Most common words across live strategy descriptions.
      </p>
    </section>
  )
}
