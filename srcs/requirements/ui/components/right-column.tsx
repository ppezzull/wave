'use client'

// Right discovery rail — pure discovery now (search, Who to follow, what's
// new). The chat FLOATS at every desktop size (components/create-drawer.tsx:
// bottom-right docked, draggable + resizable) and no longer occupies this
// column — so the rail's sections keep their natural height.
export function RightColumn({ children }: { children?: React.ReactNode }) {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-[350px] shrink-0 flex-col gap-4 overflow-hidden py-3 pl-8 pr-4 lg:flex"
      aria-label="Discovery"
    >
      {/* Server-resolved sections (Who to follow etc.) */}
      <div className="shrink-0">{children}</div>
    </aside>
  )
}
