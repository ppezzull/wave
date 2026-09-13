'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Compass,
  User,
  Settings,
  X,
  Menu,
  MessageSquare,
  Search,
} from 'lucide-react'
import { WAVE_SEARCH_EVENT } from './whats-new'
import { ThemeToggle } from './theme-toggle'
import { AccountChip } from './account-chip'
import { RailNetworkSwitcher, type NetworkOption } from './network-selector'
import { searchStrategies } from '@/app/actions/search'
import type { NetworkId } from '@/lib/networks'
import type { CurrentUser } from './app-wrapper'

function navItems(handle: string) {
  return [
    { label: 'Explore', href: '/explore', icon: Compass, id: 'explore' },
    { label: 'Chat', href: '/chat', icon: MessageSquare, id: 'chat' },
    { label: 'Profile', href: `/u/${handle}`, icon: User, id: 'profile' },
    { label: 'Settings', href: '/settings', icon: Settings, id: 'settings' },
  ]
}

function isNavActive(href: string, pathname: string): boolean {
  if (href === '/explore') return pathname === '/explore' || pathname.startsWith('/s/')
  if (href.startsWith('/u/')) return pathname.startsWith('/u/')
  return pathname === href
}

interface NavItemRowProps {
  item: ReturnType<typeof navItems>[0]
  active: boolean
  collapsed?: boolean
  onClick?: () => void
}

function NavItemRow({ item, active, collapsed = false, onClick }: NavItemRowProps) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`group relative flex items-center gap-4 rounded-full transition-colors duration-150 hover:bg-wave-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal ${
        collapsed ? 'justify-center p-3' : 'px-4 py-2.5'
      }`}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
    >
      <Icon
        size={24}
        strokeWidth={active ? 2.4 : 1.9}
        className="text-wave-text shrink-0"
        aria-hidden="true"
      />
      {!collapsed && (
        <span
          className={`font-sans text-[19px] text-wave-text ${
            active ? 'font-bold' : 'font-normal'
          }`}
        >
          {item.label}
        </span>
      )}
    </Link>
  )
}

export interface RailNetwork {
  selected: NetworkId
  options: NetworkOption[]
}

interface SearchHit {
  id: string
  description: string
  author: string
}

function StrategySearch({
  query,
  onQuery,
  onNavigate,
}: {
  query: string
  onQuery: (value: string) => void
  onNavigate?: () => void
}) {
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (query.trim().length >= 2) setOpen(true)
  }, [query])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (query.trim().length < 2) {
      setHits(null)
      return
    }
    timer.current = setTimeout(() => {
      void searchStrategies(query)
        .then((rows) => setHits(rows))
        .catch(() => setHits(null))
    }, 300)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query])

  return (
    <div className="relative mx-2">
      <div className="flex h-10 items-center gap-2.5 rounded-full border border-wave-border px-3 glass-surface transition-colors hover:border-wave-teal/60 focus-within:border-wave-teal">
        <Search size={16} className="shrink-0 text-wave-muted" aria-hidden="true" />
        <input
          id="search-strategies"
          name="q"
          type="text"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search strategies"
          className="min-w-0 flex-1 bg-transparent font-sans text-[13px] text-wave-text outline-none placeholder:text-wave-muted"
          aria-label="Search strategies"
        />
        {query && (
          <button
            onClick={() => {
              onQuery('')
              setHits(null)
            }}
            className="shrink-0 text-wave-muted hover:text-wave-text"
            aria-label="Clear search"
          >
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div
          className="absolute inset-x-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-[14px] border border-wave-border shadow-xl glass-surface"
          role="listbox"
          aria-label="Search results"
        >
          {hits === null ? (
            <p className="px-3 py-2.5 font-sans text-[12px] text-wave-muted">
              Searching…
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2.5 font-sans text-[12px] text-wave-muted">
              No strategies match “{query.trim()}”.
            </p>
          ) : (
            <ul>
              {hits.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/s/${h.id}`}
                    onClick={() => {
                      setOpen(false)
                      onNavigate?.()
                    }}
                    className="group block px-3 py-2 transition-colors hover:bg-wave-teal/10"
                    role="option"
                    aria-selected={false}
                  >
                    <span className="block font-sans text-[12px] leading-snug text-wave-text transition-colors group-hover:text-wave-teal line-clamp-2">
                      {h.description || '(no description)'}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-wave-muted">
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
  )
}

function RailContent({
  currentUser,
  network,
  keywordsSlot,
  collapsed = false,
  onNavClick,
}: {
  currentUser: CurrentUser
  network: RailNetwork
  keywordsSlot?: ReactNode
  collapsed?: boolean
  onNavClick?: () => void
}) {
  const pathname = usePathname()
  const items = navItems(currentUser.handle)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const onSearch = (e: Event) => {
      const q = (e as CustomEvent<string>).detail
      if (typeof q === 'string') setSearchQuery(q)
    }
    window.addEventListener(WAVE_SEARCH_EVENT, onSearch)
    return () => window.removeEventListener(WAVE_SEARCH_EVENT, onSearch)
  }, [])

  return (
    <div className="flex flex-col h-full py-3">
      {/* Logo */}
      <div className={`mb-1 ${collapsed ? 'flex justify-center px-0 py-2' : 'px-3 py-2'}`}>
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-full p-1 hover:bg-wave-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal"
          aria-label="wave - go to home"
        >
          <Image
            src="/wave-logo.png"
            alt=""
            width={40}
            height={40}
            className="w-10 h-10 shrink-0"
            priority
          />
          {!collapsed && (
            <span className="font-sans text-[22px] font-bold text-wave-text tracking-tight pr-2">
              wave
            </span>
          )}
        </Link>
      </div>

      {/* Nav items */}
      <nav
        className={`flex flex-col gap-1 ${collapsed ? 'px-2 items-center' : 'px-2'}`}
        aria-label="Main navigation"
      >
        {items.map((item) => (
          <NavItemRow
            key={item.id}
            item={item}
            active={isNavActive(item.href, pathname)}
            collapsed={collapsed}
            onClick={onNavClick}
          />
        ))}
      </nav>

      {!collapsed && (
        <div className="mt-3 flex flex-col gap-3">
          <StrategySearch
            query={searchQuery}
            onQuery={setSearchQuery}
            onNavigate={onNavClick}
          />
          {keywordsSlot}
        </div>
      )}

      <div className="flex-1" aria-hidden="true" />

      {/* Network switcher — the same selection as Settings, inline */}
      <div className={`mb-1 ${collapsed ? 'flex justify-center px-2' : 'px-2'}`}>
        <RailNetworkSwitcher
          selected={network.selected}
          options={network.options}
          collapsed={collapsed}
        />
      </div>

      {/* Theme toggle */}
      <div className={`mb-1 ${collapsed ? 'flex justify-center px-2' : 'px-2'}`}>
        <ThemeToggle collapsed={collapsed} />
      </div>

      {/* Account chip — Privy-connected wallet, or the server fallback */}
      <AccountChip
        currentUser={currentUser}
        collapsed={collapsed}
        onNavClick={onNavClick}
      />
    </div>
  )
}

export function LeftRail({
  currentUser,
  network,
  keywordsSlot,
}: {
  currentUser: CurrentUser
  network: RailNetwork
  keywordsSlot?: ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Desktop rail (full) — transparent: the pixel ocean shows through
          (the feed column stays the opaque readable island). */}
      <aside
        className="hidden xl:flex sticky top-0 h-screen w-[275px] shrink-0 flex-col"
        aria-label="Navigation sidebar"
      >
        <RailContent currentUser={currentUser} network={network} keywordsSlot={keywordsSlot} collapsed={false} />
      </aside>

      {/* Tablet/laptop rail: icon-only */}
      <aside
        className="hidden md:flex xl:hidden sticky top-0 h-screen w-[88px] shrink-0 flex-col"
        aria-label="Navigation sidebar"
      >
        <RailContent currentUser={currentUser} network={network} keywordsSlot={keywordsSlot} collapsed={true} />
      </aside>

      {/* Mobile: top header bar with burger + logo */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-12 flex items-center gap-2 px-2 bg-wave-bg/90 backdrop-blur-md border-b border-wave-border">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-full text-wave-text hover:bg-wave-surface transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label="wave - go to home"
        >
          <Image
            src="/wave-logo.png"
            alt=""
            width={30}
            height={30}
            className="w-[30px] h-[30px]"
            priority
          />
          <span className="font-sans text-lg font-bold tracking-tight text-wave-text">
            wave
          </span>
        </Link>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="md:hidden fixed left-0 top-0 bottom-0 w-[280px] z-50 bg-wave-bg/95 backdrop-blur-md border-r border-wave-border flex flex-col"
            aria-label="Navigation sidebar"
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center text-wave-muted hover:text-wave-text rounded-full"
              aria-label="Close navigation menu"
            >
              <X size={18} aria-hidden="true" />
            </button>
            <RailContent
              currentUser={currentUser}
              network={network}
              keywordsSlot={keywordsSlot}
              collapsed={false}
              onNavClick={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </>
  )
}
