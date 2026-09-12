'use client'

// /chat — the CONVERSATION SELECTOR. The chat itself is the floating widget
// (components/create-drawer.tsx), the only chat surface; this page lists the
// wallet's shipped strategies as threads (MUI conversation-list anatomy) and
// one click opens the widget replaying that conversation (openAgent).
import { Plus } from 'lucide-react'
import { useDrawer } from '@/components/drawer-context'
import { ThreadRow } from '@/components/thread-row'
import { useThreads } from '@/hooks/use-threads'
import { ConnectButton } from '@/components/connect-button'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

export function ChatSelector() {
  const { openCreate } = useDrawer()
  const threads = useThreads()

  return (
    <>
      <header className="sticky top-12 md:top-0 z-30 bg-wave-bg/85 backdrop-blur-md border-b border-wave-border px-4 py-2.5 flex items-center justify-between">
        <h1 className="font-sans font-bold text-[1.25rem] text-wave-text">
          Chats
        </h1>
        <button
          onClick={() => openCreate()}
          className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-[14px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: LISBOA }}
          aria-label="Start a new strategy chat"
        >
          <Plus size={16} aria-hidden="true" />
          New
        </button>
      </header>

      <div className="flex-1">
        {threads.phase === 'resolving' ? (
          <div className="animate-pulse px-4 py-4 space-y-3" aria-hidden="true">
            <div className="h-14 rounded-lg bg-wave-surface" />
            <div className="h-14 rounded-lg bg-wave-surface" />
            <div className="h-14 rounded-lg bg-wave-surface" />
          </div>
        ) : threads.phase === 'disconnected' ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
            <p className="font-sans text-[15px] text-wave-muted">
              Connect your wallet to see your strategy threads.
            </p>
            <ConnectButton />
          </div>
        ) : threads.phase === 'loading' ? (
          <div className="animate-pulse px-4 py-4 space-y-3" aria-hidden="true">
            <div className="h-14 rounded-lg bg-wave-surface" />
            <div className="h-14 rounded-lg bg-wave-surface" />
          </div>
        ) : threads.threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
            <p className="font-sans text-[15px] text-wave-muted">
              No strategies yet — ship your first one and it becomes a thread
              here.
            </p>
            <button
              onClick={() => openCreate()}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 font-sans text-[14px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: LISBOA }}
            >
              Start one
            </button>
          </div>
        ) : (
          <div role="listbox" aria-label="Your strategy threads">
            {threads.threads.map((s) => (
              <div key={s.id} className="border-b border-wave-border">
                <ThreadRow strategy={s} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
