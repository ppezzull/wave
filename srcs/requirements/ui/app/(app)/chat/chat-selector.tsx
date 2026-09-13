'use client'

// /chat — the CONVERSATION SELECTOR. The chat itself is the floating widget
// (components/create-drawer.tsx), the only chat surface; this page lists the
// wallet's shipped strategies as threads (MUI conversation-list anatomy) and
// one click opens the widget replaying that conversation (openAgent).
// SAVED CONVERSATIONS live above: the local archive of transcripts (auto-saved
// on ship, manual via the widget's bookmark) with export/import — and the
// ON-CHAIN VAULT: one wallet signature derives an AES key client-side, only
// ciphertext goes on-chain (ChatVault, Sepolia) — restorable on any device
// with the same wallet. The file export stays as the offline fallback.
import { useEffect, useRef, useState } from 'react'
import { Bookmark, CloudUpload, Download, Plus, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import { useDrawer } from '@/components/drawer-context'
import { ThreadRow } from '@/components/thread-row'
import { useThreads, type InitialThreads } from '@/hooks/use-threads'
import { useChatVault } from '@/hooks/use-chat-vault'
import { ConnectButton } from '@/components/connect-button'
import { MicroSkeleton } from '@/components/skeleton'
import type { LatestVault } from '@/app/actions/chatVault'
import {
  CHAT_ARCHIVE_EVENT,
  exportChats,
  importChats,
  readArchive,
  removeFromArchive,
  type ArchivedChat,
} from '@/lib/chat-archive'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

function SavedConversations({ initialVault }: { initialVault?: LatestVault | null }) {
  const { openReplay } = useDrawer()
  const vault = useChatVault()
  const [chats, setChats] = useState<ArchivedChat[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [onchain, setOnchain] = useState<{ nonce: string; timestamp: string; txHash: string } | null | undefined>(
    initialVault === undefined
      ? undefined
      : initialVault
        ? { nonce: initialVault.nonce, timestamp: initialVault.timestamp, txHash: initialVault.txHash }
        : null,
  )

  useEffect(() => {
    const sync = () => setChats(readArchive())
    sync()
    window.addEventListener(CHAT_ARCHIVE_EVENT, sync)
    return () => window.removeEventListener(CHAT_ARCHIVE_EVENT, sync)
  }, [])

  // After a backup, the hook's lastTx is the truth — no extra subgraph read.
  useEffect(() => {
    if (vault.phase !== 'done' || !vault.lastTx) return
    setOnchain((prev) =>
      prev
        ? { ...prev, txHash: vault.lastTx as string }
        : { nonce: '0', timestamp: String(Math.floor(Date.now() / 1000)), txHash: vault.lastTx as string },
    )
  }, [vault.phase, vault.lastTx])

  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      await importChats(file)
    } catch {
      // not a wave export — ignored honestly
    }
  }

  const vaultBusy = vault.phase === 'signing' || vault.phase === 'working'
  const vaultLabel =
    vault.phase === 'signing'
      ? vault.devicePhase === 'sign-on-device' || vault.devicePhase === 'ready-on-device' || vault.devicePhase === 'app-opening'
        ? 'Confirm on device…'
        : 'Sign to encrypt…'
      : vault.phase === 'working'
        ? 'Writing on-chain…'
        : 'Back up on-chain'

  return (
    <section className="px-4 pt-4 pb-2" aria-labelledby="saved-chats-heading">
      <div className="flex items-center justify-between mb-2">
        <h2
          id="saved-chats-heading"
          className="flex items-center gap-2 font-sans font-semibold text-[1rem] text-wave-text"
        >
          <Bookmark size={14} className="text-wave-teal" aria-hidden="true" />
          Saved conversations
        </h2>
        <div className="flex items-center gap-1">
          {chats && chats.length > 0 && (
            <button
              onClick={() => exportChats(chats)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 font-sans text-[12px] text-wave-muted hover:text-wave-text transition-colors"
              aria-label="Export all saved conversations as a JSON file"
            >
              <Download size={13} aria-hidden="true" />
              Export
            </button>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 font-sans text-[12px] text-wave-muted hover:text-wave-text transition-colors"
            aria-label="Import conversations from a JSON file"
          >
            <Upload size={13} aria-hidden="true" />
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onImport(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button
            onClick={() => void vault.backup()}
            disabled={vaultBusy}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 font-sans text-[12px] text-wave-muted hover:text-wave-teal transition-colors disabled:opacity-60"
            aria-label="Back up your conversations on-chain, encrypted with your wallet signature"
            title="One signature encrypts the archive; only ciphertext goes on-chain"
          >
            <CloudUpload size={13} aria-hidden="true" />
            {vaultLabel}
          </button>
          <button
            onClick={() => void vault.restore()}
            disabled={vaultBusy}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 font-sans text-[12px] text-wave-muted hover:text-wave-teal transition-colors disabled:opacity-60"
            aria-label="Restore your latest on-chain backup (needs the same wallet's signature)"
          >
            <Download size={13} aria-hidden="true" />
            Restore
          </button>
        </div>
      </div>

      {/* The vault status line — honest about what's on-chain right now. */}
      {vault.error && (
        <p className="font-sans text-[12px] mb-2" style={{ color: '#E5484D' }} role="alert">
          {vault.error}
        </p>
      )}
      {vault.phase === 'done' && vault.lastTx && (
        <p className="font-sans text-[12px] mb-2 text-wave-teal">
          Backed up on-chain —{' '}
          <a
            href={`https://sepolia.etherscan.io/tx/${vault.lastTx}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            tx {vault.lastTx.slice(0, 10)}…
          </a>
        </p>
      )}
      {onchain !== undefined && onchain !== null && vault.phase !== 'error' && (
        <p className="font-sans text-[11px] text-wave-muted mb-2">
          Last on-chain backup: #{onchain.nonce} ·{' '}
          {new Date(Number(onchain.timestamp) * 1000).toLocaleString()} ·{' '}
          <Link
            href={`https://sepolia.etherscan.io/tx/${onchain.txHash}`}
            target="_blank"
            className="underline underline-offset-2 hover:text-wave-text"
          >
            receipt
          </Link>{' '}
          · encrypted, only your wallet can read it
        </p>
      )}
      {chats === null ? null : chats.length === 0 ? (
        <p className="font-sans text-[13px] text-wave-muted leading-relaxed py-2">
          Conversations save here when you ship (or hit the bookmark in the
          chat). Export them as a file. They survive browser resets and move
          across devices.
        </p>
      ) : (
        <ul className="flex flex-col">
          {chats.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 border-b border-wave-border last:border-b-0"
            >
              <button
                onClick={() => openReplay(c)}
                className="flex-1 min-w-0 text-left py-2.5 pr-2 hover:opacity-80 transition-opacity"
                aria-label={`Open conversation: ${c.title}`}
              >
                <span className="block font-sans text-[14px] text-wave-text leading-snug line-clamp-2">
                  {c.title}
                </span>
                <span className="block font-mono text-[11px] text-wave-muted mt-0.5">
                  {new Date(c.savedAt).toLocaleString()} · {c.messages.length}{' '}
                  messages
                </span>
              </button>
              <button
                onClick={() => exportChats([c])}
                className="w-8 h-8 flex items-center justify-center text-wave-muted hover:text-wave-text rounded-full transition-colors shrink-0"
                aria-label={`Download conversation: ${c.title}`}
                title="Download as JSON"
              >
                <Download size={14} aria-hidden="true" />
              </button>
              <button
                onClick={() => removeFromArchive(c.id)}
                className="w-8 h-8 flex items-center justify-center text-wave-muted hover:text-wave-text rounded-full transition-colors shrink-0"
                aria-label={`Delete conversation: ${c.title}`}
                title="Delete"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ChatSelector({
  initialThreads,
  initialVault,
}: {
  initialThreads?: InitialThreads
  initialVault?: LatestVault | null
}) {
  const { openCreate } = useDrawer()
  const threads = useThreads(initialThreads)

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

      <SavedConversations initialVault={initialVault} />

      <div className="flex-1">
        {threads.phase === 'resolving' ? (
          <MicroSkeleton label="Resolving wallet" />
        ) : threads.phase === 'disconnected' ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
            <p className="font-sans text-[15px] text-wave-muted">
              Connect your wallet to see your strategy threads.
            </p>
            <ConnectButton />
          </div>
        ) : threads.phase === 'loading' ? (
          <MicroSkeleton label="Loading chats" />
        ) : threads.threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
            <p className="font-sans text-[15px] text-wave-muted">
              No strategies yet. Ship your first one and it becomes a thread
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
