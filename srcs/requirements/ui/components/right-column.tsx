'use client'

import { Search } from 'lucide-react'

// Right discovery rail — search + attribution. The "Who to follow" section is
// gone with the follow graph; a trust-resolver-driven people panel can slot
// back in here later.
export function RightColumn() {
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

      {/* Attribution */}
      <p className="px-4 font-sans text-[12px] text-wave-muted leading-relaxed">
        Powered by SwapVM &middot; Flavio, Pietro &amp; Flaviano &middot; 2026
      </p>
    </aside>
  )
}
