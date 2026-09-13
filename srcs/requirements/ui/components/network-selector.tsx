'use client'

// Network selector (Settings + sidebar popover) — switches the app's READ
// surface per network: feed, search, profiles, strategy pages and swap
// history all resolve their subgraph + RPC from the selection (cookie
// `wave-network`, read per request server-side — no rebuild, no logout).
// Ships are the honest exception: the agent signs on ONE chain
// (AGENT_NETWORK); the ship action refuses when the selector points
// elsewhere. Mainnet stays locked until Sepolia is fully tested (its row
// explains what unlocking takes).
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, ChevronUp, Globe, Lock } from 'lucide-react'
import { setNetwork } from '@/app/actions/network'
import type { NetworkId } from '@/lib/networks'

export interface NetworkOption {
  id: NetworkId
  label: string
  note: string
  disabled: boolean
}

export function NetworkSelector({
  selected,
  options,
}: {
  selected: NetworkId
  options: NetworkOption[]
}) {
  const router = useRouter()
  const [active, setActive] = useState<NetworkId>(selected)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const pick = (id: NetworkId) => {
    if (id === active) return
    setError(null)
    start(async () => {
      const r = await setNetwork(id)
      if (!r.ok) {
        setError(r.reason ?? 'Could not switch network')
        return
      }
      setActive(id)
      router.refresh() // server components re-read the new network immediately
    })
  }

  return (
    <div className="flex flex-col gap-3" role="radiogroup" aria-label="Network">
      {options.map((opt) => {
        const isSelected = active === opt.id
        return (
          <button
            key={opt.id}
            role="radio"
            aria-checked={isSelected}
            disabled={opt.disabled || pending}
            onClick={() => pick(opt.id)}
            className={`w-full flex items-start gap-3 rounded-[12px] px-4 py-3.5 text-left transition-all border ${
              opt.disabled
                ? 'opacity-50 cursor-not-allowed border-wave-border bg-transparent'
                : isSelected
                  ? 'border-wave-teal bg-wave-surface'
                  : 'border-wave-border hover:bg-wave-surface cursor-pointer'
            }`}
            aria-label={`${opt.label}${opt.disabled ? ' (locked)' : ''}`}
          >
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              {opt.disabled ? (
                <Lock size={16} className="text-wave-muted" />
              ) : (
                <Globe size={16} className={isSelected ? 'text-wave-teal' : 'text-wave-muted'} />
              )}
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-sans text-[14px] font-semibold text-wave-text">
                  {opt.label}
                </span>
                {isSelected && !opt.disabled && (
                  <Check size={14} className="text-wave-teal" aria-hidden="true" />
                )}
              </span>
              <span className="font-sans text-[12px] text-wave-muted leading-snug">
                {opt.note}
              </span>
            </span>
          </button>
        )
      })}
      {error && (
        <p className="font-sans text-[12px]" style={{ color: '#E5484D' }} role="alert">
          {error}
        </p>
      )}
      <p className="font-sans text-[11px] text-wave-muted leading-relaxed">
        Reads follow this selection everywhere. Ships execute on the agent&rsquo;s
        network (Sepolia). The confirm step says so honestly if they disagree.
      </p>
    </div>
  )
}

/**
 * Sidebar variant — a compact trigger row (or icon button, collapsed rail)
 * that opens a popover with the same options as Settings. Same cookie, same
 * setNetwork action; the server layout re-reads the selection on refresh so
 * every surface follows. The popover opens over the feed column and closes on
 * outside-click or selection.
 */
export function RailNetworkSwitcher({
  selected,
  options,
  collapsed = false,
  dropUp = true,
}: {
  selected: NetworkId
  options: NetworkOption[]
  collapsed?: boolean
  /** Popover direction: up (rail — it sits at the bottom) or down (headers). */
  dropUp?: boolean
}) {
  const router = useRouter()
  const [active, setActive] = useState<NetworkId>(selected)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)

  // Settings can flip the network while the rail stays mounted — follow the
  // server-provided selection whenever it moves.
  useEffect(() => setActive(selected), [selected])

  // Outside-click closes the popover.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (id: NetworkId) => {
    if (id === active || pending) return
    setError(null)
    start(async () => {
      const r = await setNetwork(id)
      if (!r.ok) {
        setError(r.reason ?? 'Could not switch network')
        return
      }
      setActive(id)
      setOpen(false)
      router.refresh() // server components re-read the new network immediately
    })
  }

  const current = options.find((o) => o.id === active)
  const label = current?.label ?? 'Network'

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Network: ${label}`}
        className={`group flex items-center rounded-full transition-colors duration-150 hover:bg-wave-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal ${
          collapsed ? 'justify-center w-12 h-12' : 'w-full gap-4 px-4 py-2.5'
        }`}
      >
        <span className="relative shrink-0" aria-hidden="true">
          <Globe
            size={collapsed ? 20 : 24}
            strokeWidth={1.9}
            className="text-wave-text"
          />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-wave-teal" />
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 min-w-0 text-left font-sans text-[19px] text-wave-text truncate">
              {label}
            </span>
            {dropUp ? (
              <ChevronUp
                size={17}
                className={`text-wave-muted shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                size={17}
                className={`text-wave-muted shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            )}
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Network"
          className={`glass-surface absolute left-0 z-50 w-[248px] py-1.5 rounded-[16px] border border-wave-border shadow-2xl ${
            dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <p className="px-4 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-wave-muted">
            Network
          </p>
          {options.map((opt) => {
            const isSelected = active === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                disabled={opt.disabled || pending}
                onClick={() => pick(opt.id)}
                title={opt.note}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-wave-bg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {opt.disabled ? (
                  <Lock size={15} className="text-wave-muted shrink-0" aria-hidden="true" />
                ) : (
                  <Globe
                    size={15}
                    className={`shrink-0 ${isSelected ? 'text-wave-teal' : 'text-wave-muted'}`}
                    aria-hidden="true"
                  />
                )}
                <span className="flex-1 min-w-0 font-sans text-[14px] text-wave-text truncate">
                  {opt.label}
                </span>
                {isSelected && !opt.disabled && (
                  <Check size={15} className="text-wave-teal shrink-0" aria-hidden="true" />
                )}
              </button>
            )
          })}
          {error && (
            <p
              className="px-4 pt-1.5 pb-1 font-sans text-[12px]"
              style={{ color: '#E5484D' }}
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
