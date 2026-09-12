'use client'

// One conversation row — MUI x-chat conversation anatomy, wave styling:
// 40px avatar, title (bold while the strategy is active), one-line preview,
// right-aligned recency. ARIA listbox/option per their pattern. Used by BOTH
// the /chat selector page (full-width) and the widget's sidebar (compact).
import { MessageSquare } from 'lucide-react'
import type { Strategy } from '@/lib/data'
import { formatRecency } from '@/lib/strategy/format'
import { useDrawer } from './drawer-context'

export function ThreadRow({
  strategy,
  compact = false,
  selected = false,
}: {
  strategy: Strategy
  /** Sidebar inside the widget: tighter paddings, smaller avatar. */
  compact?: boolean
  selected?: boolean
}) {
  const { openAgent } = useDrawer()
  const active = strategy.status === 'active'

  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={() => openAgent(strategy)}
      className={`w-full flex items-start gap-3 text-left transition-colors hover:bg-wave-surface ${
        compact ? 'px-3 py-2' : 'px-4 py-3.5'
      } ${selected ? 'bg-wave-surface' : ''}`}
      aria-label={`Open the conversation behind ${strategy.description.slice(0, 48)}`}
    >
      <span
        className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} shrink-0 flex items-center justify-center rounded-full`}
        style={{
          background: active
            ? 'linear-gradient(135deg, #2A9D8F, #0F3460)'
            : 'var(--glass-fill)',
          border: '1px solid var(--glass-hairline)',
        }}
        aria-hidden="true"
      >
        <MessageSquare
          size={compact ? 14 : 17}
          style={{ color: active ? '#FFF3E0' : '#2A9D8F' }}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span
            className={`font-mono ${compact ? 'text-[12px]' : 'text-[14px]'} ${
              active ? 'font-bold' : 'font-semibold'
            } text-wave-text truncate`}
          >
            {strategy.authorHandle}
          </span>
          <span className="font-sans text-[11px] text-wave-muted shrink-0">
            {formatRecency(strategy.lastSwapTimestamp)}
          </span>
        </span>
        <span
          className={`font-sans ${compact ? 'text-[12px]' : 'text-[13px]'} text-wave-muted leading-snug ${
            compact ? 'line-clamp-1' : 'line-clamp-2'
          }`}
        >
          {strategy.description || '(no description)'}
        </span>
      </span>
    </button>
  )
}
