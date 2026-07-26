'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Compass,
  UserPlus,
  Sparkles,
  User,
  Settings,
  X,
  Menu,
  Feather,
  MessageSquare,
} from 'lucide-react'
import { useDrawer } from './drawer-context'
import { ThemeToggle } from './theme-toggle'
import { currentUser } from '@/lib/mock-data'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

const navItems = [
  { label: 'Explore', href: '/explore', icon: Compass, id: 'explore' },
  { label: 'Follow', href: '/follow', icon: UserPlus, id: 'follow' },
  { label: 'Followed', href: '/followed', icon: Sparkles, id: 'followed' },
  { label: 'Chat', href: '/chat', icon: MessageSquare, id: 'chat' },
  { label: 'Profile', href: `/u/${currentUser.handle}`, icon: User, id: 'profile' },
  { label: 'Settings', href: '/settings', icon: Settings, id: 'settings' },
]

function isNavActive(href: string, pathname: string): boolean {
  if (href === '/explore') return pathname === '/explore' || pathname.startsWith('/s/')
  if (href.startsWith('/u/')) return pathname.startsWith('/u/')
  return pathname === href
}

interface NavItemRowProps {
  item: (typeof navItems)[0]
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

function RailContent({
  collapsed = false,
  onNavClick,
}: {
  collapsed?: boolean
  onNavClick?: () => void
}) {
  const pathname = usePathname()
  const { openCreate } = useDrawer()

  return (
    <div className="flex flex-col h-full py-3">
      {/* Logo */}
      <div className={`mb-1 ${collapsed ? 'flex justify-center px-0 py-2' : 'px-3 py-2'}`}>
        <Link
          href="/explore"
          className="inline-flex items-center gap-2.5 rounded-full p-1 hover:bg-wave-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal"
          aria-label="wave - go to explore"
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
        {navItems.map((item) => (
          <NavItemRow
            key={item.id}
            item={item}
            active={isNavActive(item.href, pathname)}
            collapsed={collapsed}
            onClick={onNavClick}
          />
        ))}
      </nav>

      {/* Create button */}
      <div className={`mt-4 ${collapsed ? 'flex justify-center px-2' : 'px-3'}`}>
        {collapsed ? (
          <button
            onClick={openCreate}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm transition-all duration-[220ms] hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: LISBOA }}
            aria-label="Create new strategy"
          >
            <Feather size={20} aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={openCreate}
            className="w-full py-3.5 font-sans text-[16px] font-bold text-white rounded-full shadow-sm transition-all duration-[220ms] hover:brightness-110 active:scale-[0.99]"
            style={{ background: LISBOA }}
            aria-label="Create new strategy"
          >
            Create
          </button>
        )}
      </div>

      <div className="flex-1" aria-hidden="true" />

      {/* Theme toggle */}
      <div className={`mb-1 ${collapsed ? 'flex justify-center px-2' : 'px-2'}`}>
        <ThemeToggle collapsed={collapsed} />
      </div>

      {/* Account chip */}
      <div className={collapsed ? 'flex justify-center px-2' : 'px-3'}>
        <Link
          href={`/u/${currentUser.handle}`}
          onClick={onNavClick}
          className={`flex items-center rounded-full hover:bg-wave-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal ${
            collapsed ? 'justify-center p-1.5' : 'gap-3 p-2.5'
          }`}
          aria-label={`Your profile, ${currentUser.name}`}
        >
          <div
            className="w-10 h-10 rounded-full shrink-0 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #2A9D8F, #0F3460)' }}
            aria-hidden="true"
          >
            {currentUser.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentUser.avatarUrl || '/placeholder.svg'}
                alt=""
                className="w-full h-full object-cover"
              />
            )}
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="font-mono text-[15px] font-semibold text-wave-text truncate">
                {currentUser.name}
              </span>
              <span className="font-mono text-[13px] text-wave-muted truncate">
                {`${currentUser.walletAddress.slice(0, 6)}...${currentUser.walletAddress.slice(-4)}`}
              </span>
            </div>
          )}
        </Link>
      </div>
    </div>
  )
}

export function LeftRail() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Desktop rail (full) */}
      <aside
        className="hidden xl:flex sticky top-0 h-screen w-[275px] shrink-0 flex-col bg-wave-bg"
        aria-label="Navigation sidebar"
      >
        <RailContent collapsed={false} />
      </aside>

      {/* Tablet/laptop rail: icon-only */}
      <aside
        className="hidden md:flex xl:hidden sticky top-0 h-screen w-[88px] shrink-0 flex-col bg-wave-bg"
        aria-label="Navigation sidebar"
      >
        <RailContent collapsed={true} />
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
          href="/explore"
          className="flex items-center gap-2"
          aria-label="wave - go to explore"
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
            className="md:hidden fixed left-0 top-0 bottom-0 w-[280px] z-50 bg-wave-bg border-r border-wave-border flex flex-col"
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
              collapsed={false}
              onNavClick={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </>
  )
}
