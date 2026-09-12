'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { searchStrategies } from '@/app/actions/search'

interface Hit {
  id: string
  description: string
  author: string
}

// Right discovery rail — search + attribution. The search hits the REAL
// subgraph (description substring, or author lookup for a bare 0x address)
// via the searchStrategies server action; results link to /s/<id>. The old
// input was a dead stub — no handler, no data. The "Who to follow" section is
// gone with the follow graph; a trust-resolver-driven people panel can slot
// back in here later.
export function RightColumn() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced live search — 300ms after typing stops; <2 chars clears.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) {
      setHits(null)
      return
    }
    timer.current = setTimeout(() => {
      void searchStrategies(q)
        .then((rows) => setHits(rows))
        .catch(() => setHits(null))
    }, 300)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

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
            id="search-strategies"
            name="q"
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search strategies"
            className="flex-1 min-w-0 bg-transparent outline-none font-sans text-[15px] text-wave-text placeholder:text-wave-muted"
            aria-label="Search strategies"
          />
          {q && (
            <button
              onClick={() => {
                setQ('')
                setHits(null)
              }}
              className="text-wave-muted hover:text-wave-text shrink-0"
              aria-label="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Results — real rows from the subgraph, or the honest empty */}
        {open && q.trim().length >= 2 && (
          <div
            className="mt-1 rounded-[12px] bg-wave-surface border border-wave-border overflow-hidden"
            role="listbox"
            aria-label="Search results"
          >
            {hits === null ? (
              <p className="px-4 py-3 font-sans text-[13px] text-wave-muted">
                Searching…
              </p>
            ) : hits.length === 0 ? (
              <p className="px-4 py-3 font-sans text-[13px] text-wave-muted">
                No strategies match “{q.trim()}”.
              </p>
            ) : (
              <ul>
                {hits.map((h) => (
                  <li key={h.id}>
                    <Link
                      href={`/s/${h.id}`}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-2.5 hover:bg-wave-bg transition-colors"
                      role="option"
                      aria-selected={false}
                    >
                      <span className="block font-sans text-[13px] text-wave-text leading-snug line-clamp-2">
                        {h.description || '(no description)'}
                      </span>
                      <span className="block font-mono text-[11px] text-wave-muted mt-0.5">
                        {h.author.slice(0, 6)}…{h.author.slice(-4)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Attribution */}
      <p className="px-4 font-sans text-[12px] text-wave-muted leading-relaxed">
        Powered by SwapVM &middot; Flavio, Pietro &amp; Flaviano &middot; 2026
      </p>
    </aside>
  )
}
