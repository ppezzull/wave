'use client'

import { useRouter } from 'next/navigation'
import { GitFork, TrendingUp, TrendingDown } from 'lucide-react'
import { useCountUp } from '@/hooks/use-count-up'
import {
  type Strategy,
  returnPct,
  returnPctStr,
  formatEth,
  formatUsd,
  formatRecency,
} from '@/lib/mock-data'

interface StrategyCardProps {
  strategy: Strategy
  isDetailed?: boolean
  /** In the landing hero preview, disable navigation and drawer */
  isPreview?: boolean
}

export function StrategyCard({
  strategy,
  isDetailed = false,
  isPreview = false,
}: StrategyCardProps) {
  const router = useRouter()

  const ret = returnPct(strategy)
  const retStr = returnPctStr(strategy)

  const animated = useCountUp(Math.abs(ret), 800)
  const displayValue = isDetailed ? Math.abs(ret) : animated

  const isPositive = ret >= 0
  const returnColor = isPositive ? '#1F9D6B' : '#E5484D'
  const returnPrefix = isPositive ? '+' : '-'
  const TrendIcon = isPositive ? TrendingUp : TrendingDown

  const handleCardClick = () => {
    if (!isDetailed && !isPreview) router.push(`/s/${strategy.id}`)
  }
  // Fork is a first-class verb → /compose?fork=<id> prefill (Pietro.md L61).
  const handleFork = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isPreview) router.push(`/compose?fork=${encodeURIComponent(strategy.id)}`)
  }

  return (
    <article
      className={`bg-wave-bg transition-colors duration-150 ${
        isPreview
          ? 'glass-card rounded-[16px] p-4'
          : isDetailed
            ? 'px-4 py-4'
            : 'px-4 py-3 border-b border-wave-border hover:bg-wave-surface cursor-pointer'
      }`}
      onClick={handleCardClick}
      role={!isDetailed && !isPreview ? 'button' : undefined}
      tabIndex={!isDetailed && !isPreview ? 0 : undefined}
      aria-label={
        !isDetailed && !isPreview
          ? `View strategy by ${strategy.authorHandle}, return ${retStr}`
          : undefined
      }
      onKeyDown={
        !isDetailed && !isPreview
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') handleCardClick()
            }
          : undefined
      }
    >
      <div className="flex gap-3">
        <div
          className="w-11 h-11 rounded-full shrink-0"
          style={{ background: 'linear-gradient(135deg, #2A9D8F, #0F3460)' }}
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[15px] font-semibold text-wave-text truncate">
              {strategy.authorHandle}
            </span>
            <span className="text-wave-muted" aria-hidden="true">
              ·
            </span>
            <span className="font-sans text-[14px] text-wave-muted">
              {formatRecency(strategy.lastSwapTimestamp)}
            </span>
          </div>

          <p
            className={`font-sans text-[15px] text-wave-text mt-0.5 leading-normal ${
              !isDetailed ? 'line-clamp-4' : ''
            }`}
          >
            {strategy.description}
          </p>

          <div
            className="mt-3 inline-flex items-center gap-2 rounded-2xl px-3.5 py-2.5"
            style={{
              background: isPositive
                ? 'rgba(31,157,107,0.08)'
                : 'rgba(229,72,77,0.08)',
              border: `1px solid ${isPositive ? 'rgba(31,157,107,0.25)' : 'rgba(229,72,77,0.25)'}`,
            }}
            aria-label={`Return: ${retStr}`}
          >
            <TrendIcon size={22} style={{ color: returnColor }} aria-hidden="true" />
            <span
              className="font-mono font-bold leading-none"
              style={{ color: returnColor, fontSize: isPreview ? '1.5rem' : '1.75rem' }}
            >
              {returnPrefix}
              {displayValue.toFixed(1)}%
            </span>
          </div>

          <div className="flex items-center gap-5 mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] text-wave-text">
                {formatEth(strategy.committedCapital)}
              </span>
              <span className="font-sans text-[12px] text-wave-muted">committed</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] text-wave-text">
                {formatUsd(strategy.cumulativeVolumeOut)}
              </span>
              <span className="font-sans text-[12px] text-wave-muted">volume</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] text-wave-text">
                {strategy.swapCount}
              </span>
              <span className="font-sans text-[12px] text-wave-muted">fills</span>
            </div>
          </div>

          {!isPreview && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleFork}
                className="flex items-center justify-center gap-1.5 px-4 h-9 rounded-full font-sans text-[14px] font-semibold text-wave-muted border border-wave-border hover:bg-wave-surface transition-colors duration-150"
                aria-label="Fork this strategy"
              >
                <GitFork size={14} aria-hidden="true" />
                Fork
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
