'use client'

import { useEffect, useState } from 'react'
import { useTheme } from './theme-provider'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // next-themes resolves on the client; wait to avoid a hydration mismatch.
  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'
  const toggle = () => setTheme(isDark ? 'light' : 'dark')

  // Label/icon are stable until mounted so SSR and first client render match.
  const Icon = mounted && !isDark ? Sun : Moon
  const label = mounted && !isDark ? 'Switch to dark mode' : 'Switch to light mode'

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className="w-12 h-12 rounded-full flex items-center justify-center text-wave-text hover:bg-wave-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal"
        aria-label={label}
        title={label}
      >
        <Icon size={20} aria-hidden="true" />
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center gap-4 rounded-full px-4 py-2.5 text-wave-text hover:bg-wave-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal"
      aria-label={label}
    >
      <Icon size={24} strokeWidth={1.9} className="shrink-0" aria-hidden="true" />
      <span className="font-sans text-[19px]">
        {mounted && !isDark ? 'Light' : 'Dark'} mode
      </span>
    </button>
  )
}
