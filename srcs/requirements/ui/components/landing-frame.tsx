import type { ReactNode } from 'react'
import { PixelWaves } from '@/components/ui/pixel/animations/pixel-waves'
import { ThemeToggle } from '@/components/theme-toggle'

/** Landing chrome — pixel ocean + top-right theme toggle. */
export function LandingFrame({
  left,
  children,
}: {
  left?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-wave-bg">
      <div className="pointer-events-none fixed inset-0 z-0">
        <PixelWaves
          className="h-full w-full"
          colors={['#0F3460', '#2A9D8F', '#26A69A', '#FFF3E0']}
          pixelSize={16}
          gap={2}
          speed={0.8}
          opacity={0.9}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-wave-bg via-wave-bg/70 to-transparent md:via-wave-bg/40" />
      </div>

      <header className="relative z-20 flex h-16 shrink-0 items-center justify-between px-5 md:px-10">
        <div className="min-w-0">{left}</div>
        <ThemeToggle collapsed />
      </header>

      <div className="relative z-10 flex-1">{children}</div>
    </main>
  )
}
