'use client'

// Micro-skeleton fallbacks for streaming SSR — the landing's pixel ocean as
// the loading language: each section shows the animated PixelWaves backdrop
// (same Lisbon ramp, low opacity, fading into the panel) with the
// auto-skeleton mirror of the REAL component tree on top and a pulsing
// "Loading…" caption. Placeholder data is inert scaffolding only (zeros,
// dashes, pending safety) — replaced wholesale when the streamed section
// lands, never fabricated UI.
//
// Library note: the mirror runs on `auto-skeleton-react`; measurement is
// client-side, so the stand-in paints briefly before the overlay covers it
// (documented SSR behavior — the dash-shaped stand-ins read as skeletons).
import { useEffect, useState, type ReactNode } from 'react'
import { AutoSkeleton } from 'auto-skeleton-react'
import { PixelWaves } from '@/components/ui/pixel/animations/pixel-waves'
import { ExploreFeed } from '@/app/(app)/explore/explore-feed'
import { BytecodePane } from '@/components/bytecode-pane'
import { SafetyCardDetail } from '@/components/safety-card-detail'
import { HashVerify } from '@/components/hash-verify'
import type { Strategy } from '@/lib/mock-data'

// The theme surface (dark #16181C / light #F7F9FA) — read at mount so the
// skeleton matches the active theme; static fallback covers the first frame.
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

/** Themed AutoSkeleton — always in loading state (a Suspense fallback IS the
 *  loading state; the whole fallback is swapped out when content streams in). */
function AutoSkeletonThemed({ children, maxDepth = 12 }: { children: ReactNode; maxDepth?: number }) {
  const baseColor = useSurfaceColor()
  return (
    <AutoSkeleton
      loading
      config={{ animation: 'pulse', baseColor, borderRadius: 8, maxDepth }}
    >
      {children}
    </AutoSkeleton>
  )
}

/** The landing's pixel ocean, dimmed and faded into the panel — the shared
 *  loading backdrop. Canvas rAF loop; prefers-reduced-motion is respected
 *  inside PixelWaves itself. */
function WaveBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none" aria-hidden="true">
      <PixelWaves
        className="h-full w-full"
        colors={['#0F3460', '#2A9D8F', '#26A69A', '#FFF3E0']}
        pixelSize={10}
        gap={2}
        speed={0.8}
        opacity={0.16}
      />
      {/* Fade the ocean into the panel so the skeleton mirror reads on top —
          the same gradient-overlay trick the landing uses. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, var(--wave-bg) 0%, transparent 45%, var(--wave-bg) 100%)',
          opacity: 0.92,
        }}
      />
    </div>
  )
}

/** The "but with loading" caption — a wave-pulse dot + label. */
function LoadingCaption({ label }: { label: string }) {
  return (
    <span
      className="relative z-10 flex items-center gap-2 px-1 pb-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-wave-muted select-none"
      role="status"
      aria-label={label}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: '#2A9D8F', animation: 'wave-pulse 1.1s ease-in-out infinite' }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

/** Inert strategy literal — placeholder geometry, never user data. */
function placeholderStrategy(i = 0): Strategy {
  const hash = `0x${String(i).padStart(2, '0')}ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`
  return {
    id: `skeleton-${i}`,
    programHash: hash,
    ensProgramHash: hash,
    status: 'active',
    cumulativeVolumeIn: '0',
    cumulativeVolumeOut: '0',
    swapCount: 0,
    lastSwapTimestamp: 0,
    authorHandle: '0x0000…0000',
    description: '',
    committedCapital: '0',
    oracleBand: '',
    bytecode: [],
    safety: { pending: true, verdict: 'SAFE' },
    retunes: [],
  }
}

/** The explore feed while getFeed resolves — mirrors the REAL feed rows via
 *  the real ExploreFeed over the landing ocean. */
export function FeedSkeleton({ rows = 5 }: { rows?: number }) {
  const ranked = Array.from({ length: rows }, (_, i) => placeholderStrategy(i))
  return (
    <div className="relative glass-card">
      <WaveBackdrop />
      <div className="relative z-10 flex flex-col">
        <LoadingCaption label="Loading strategies" />
        <AutoSkeletonThemed>
          <ExploreFeed ranked={ranked} unranked={[]} />
        </AutoSkeletonThemed>
      </div>
    </div>
  )
}

/** The /s detail trio (bytecode + safety + hash-verify) while the program is
 *  recompiled from the post — the slowest section on first view. */
export function DetailPanelsSkeleton() {
  const s = placeholderStrategy(0)
  return (
    <div className="relative glass-card">
      <WaveBackdrop />
      <div className="relative z-10 flex flex-col gap-6">
        <LoadingCaption label="Verifying on-chain" />
        <AutoSkeletonThemed>
          <BytecodePane strategy={s} />
        </AutoSkeletonThemed>
        <AutoSkeletonThemed>
          <SafetyCardDetail strategy={s} />
        </AutoSkeletonThemed>
        <AutoSkeletonThemed>
          <HashVerify strategy={s} />
        </AutoSkeletonThemed>
      </div>
    </div>
  )
}

/** A generic card-shaped section placeholder (swaps table, profile stats). */
export function PanelSkeleton({
  lines = 3,
  className = '',
  label = 'Loading section',
}: {
  lines?: number
  className?: string
  label?: string
}) {
  return (
    <div className={`relative glass-card rounded-[14px] px-5 py-5 ${className}`}>
      <WaveBackdrop />
      <div className="relative z-10 flex flex-col gap-3">
        <LoadingCaption label={label} />
        <AutoSkeletonThemed>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[1rem] font-semibold text-wave-text">Loading…</span>
            {Array.from({ length: lines }).map((_, i) => (
              <span key={i} className="font-mono text-[13px] text-wave-text">
                {'—'.repeat(12 + ((i * 7) % 20))}
              </span>
            ))}
          </div>
        </AutoSkeletonThemed>
      </div>
    </div>
  )
}
