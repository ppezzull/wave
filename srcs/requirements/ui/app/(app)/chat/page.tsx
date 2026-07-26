'use client'

import { MessageSquare, Plus } from 'lucide-react'
import { strategies, formatRecency } from '@/lib/mock-data'
import { useDrawer } from '@/components/drawer-context'
import { Footer } from '@/components/footer'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

// A chat thread per pool agent conversation the user has worked on. Each
// carries its full Strategy so the drawer can replay that conversation.
const threads = strategies.slice(0, 6)

export default function ChatPage() {
  const { openCreate, openAgent } = useDrawer()

  return (
    <>
      {/* Sticky header */}
      <header className="sticky top-12 md:top-0 z-30 bg-wave-bg/85 backdrop-blur-md border-b border-wave-border px-4 py-2.5 flex items-center justify-between">
        <h1 className="font-sans font-bold text-[1.25rem] text-wave-text">
          Chat
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-[14px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: LISBOA }}
          aria-label="Start a new strategy chat"
        >
          <Plus size={16} aria-hidden="true" />
          New
        </button>
      </header>

      {/* Thread list */}
      <div className="flex-1">
        <ul>
          {threads.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => openAgent(s)}
                className="w-full flex items-start gap-3 px-4 py-4 border-b border-wave-border text-left transition-colors hover:bg-wave-surface"
              >
                <span
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'rgba(42,157,143,0.16)' }}
                  aria-hidden="true"
                >
                  <MessageSquare size={18} style={{ color: '#2A9D8F' }} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[14px] font-semibold text-wave-text truncate">
                      {s.authorHandle}
                    </span>
                    <span className="font-sans text-[12px] text-wave-muted shrink-0">
                      {formatRecency(s.lastSwapTimestamp)}
                    </span>
                  </span>
                  <span className="font-sans text-[14px] text-wave-muted leading-snug line-clamp-2">
                    {s.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Footer />
    </>
  )
}
