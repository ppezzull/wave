'use client'

// Single micro-load fallback: a centered AutoSkeleton over a compact measured
// tree. No captions, no pulse-dot, no hand-rolled bars — the library paints
// the blocks; this file only places them.
import { useEffect, useState, type ReactNode } from 'react'
import { AutoSkeleton } from 'auto-skeleton-react'

function useSurfaceColor(): string {
  const [color, setColor] = useState('#16181C')
  useEffect(() => {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--wave-surface')
      .trim()
    if (v) setColor(v)
  }, [])
  return color
}

/** Compact geometry AutoSkeleton measures — never shown as real UI. */
function MicroShape() {
  return (
    <div className="flex w-[260px] flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-full bg-wave-surface" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="font-sans text-[14px] font-semibold text-wave-text">
            Loading title
          </span>
          <span className="font-sans text-[12px] text-wave-muted">
            Loading subtitle
          </span>
        </span>
      </div>
      <span className="font-sans text-[13px] leading-relaxed text-wave-text">
        Loading description line one
      </span>
      <span className="font-sans text-[13px] leading-relaxed text-wave-text">
        Loading description line two
      </span>
    </div>
  )
}

export function MicroSkeleton({
  label = 'Loading',
  className = '',
  children,
}: {
  label?: string
  className?: string
  children?: ReactNode
}) {
  const baseColor = useSurfaceColor()
  return (
    <div
      className={`flex w-full items-center justify-center px-4 py-8 ${className}`}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <AutoSkeleton
        loading
        config={{ animation: 'pulse', baseColor, borderRadius: 8, maxDepth: 8 }}
      >
        {children ?? <MicroShape />}
      </AutoSkeleton>
    </div>
  )
}
