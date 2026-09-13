// Chat archive — the alternative to losing conversations.
//
// The live transcript lives in localStorage['wave:chat:messages:v1'] and is
// OVERWRITTEN by the next conversation; the archive keeps finished (or
// manually saved) conversations as named entries the /chat selector lists,
// replays in the widget, and — crucially — EXPORTS/IMPORTS as a JSON file:
// cross-browser, cross-device, no backend, no account. The file is yours.
//
// Structural LiveMessage shape (mirrors components/agent-chat.tsx; kept
// structural here so the lib never imports the component).
'use client'

export interface ArchiveMessage {
  id: string
  role: 'agent' | 'user'
  content?: string
  kind?: 'text' | 'spec' | 'ship'
  spec?: unknown
  receipt?: unknown
}

export interface ArchivedChat {
  id: string
  title: string
  savedAt: number
  messages: ArchiveMessage[]
}

const ARCHIVE_KEY = 'wave:chat:archive:v1'
const MAX_AUTO_TITLE = 64

export const CHAT_ARCHIVE_EVENT = 'wave-chat-archive'

function valid(m: unknown): m is ArchiveMessage {
  if (!m || typeof m !== 'object') return false
  const msg = m as ArchiveMessage
  return (
    typeof msg.id === 'string' &&
    (msg.role === 'agent' || msg.role === 'user') &&
    msg.kind !== undefined
  )
}

export function readArchive(): ArchivedChat[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(ARCHIVE_KEY) ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.filter(
      (c): c is ArchivedChat =>
        Boolean(c) &&
        typeof c === 'object' &&
        typeof (c as ArchivedChat).id === 'string' &&
        typeof (c as ArchivedChat).title === 'string' &&
        Array.isArray((c as ArchivedChat).messages) &&
        (c as ArchivedChat).messages.every(valid),
    )
  } catch {
    return []
  }
}

function writeArchive(chats: ArchivedChat[]) {
  window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify(chats))
  window.dispatchEvent(new CustomEvent(CHAT_ARCHIVE_EVENT))
}

/** A title from the conversation: its first user words, else the date. */
export function titleFor(messages: ArchiveMessage[], savedAt = Date.now()): string {
  const first = messages.find((m) => m.role === 'user' && typeof m.content === 'string')
  if (first?.content) {
    const t = first.content.trim().replace(/\s+/g, ' ')
    if (t) return t.length > MAX_AUTO_TITLE ? `${t.slice(0, MAX_AUTO_TITLE)}…` : t
  }
  return `Conversation ${new Date(savedAt).toLocaleString()}`
}

/** Save a conversation (auto on ship, or the manual Save button). */
export function saveToArchive(messages: ArchiveMessage[], title?: string): ArchivedChat | null {
  if (typeof window === 'undefined' || messages.length === 0) return null
  const savedAt = Date.now()
  const entry: ArchivedChat = {
    id: `c${savedAt}-${Math.random().toString(36).slice(2, 8)}`,
    title: title ?? titleFor(messages, savedAt),
    savedAt,
    messages,
  }
  writeArchive([entry, ...readArchive()])
  return entry
}

export function removeFromArchive(id: string) {
  writeArchive(readArchive().filter((c) => c.id !== id))
}

// ── Export / import — the file is portable truth ────────────────────────────

export interface ArchiveFile {
  app: 'wave'
  version: 1
  chats: ArchivedChat[]
}

export function exportChats(chats: ArchivedChat[]) {
  const file: ArchiveFile = { app: 'wave', version: 1, chats }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wave-chats-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Import a previously exported file — merges by id, newest wins. */
export async function importChats(file: File): Promise<number> {
  const parsed = JSON.parse(await file.text()) as Partial<ArchiveFile>
  if (!parsed || parsed.app !== 'wave' || !Array.isArray(parsed.chats)) {
    throw new Error('Not a wave chat export')
  }
  return mergeChats(parsed.chats)
}

/** Merge conversations into the archive (by id, newest wins) — the shared
 *  path for file imports AND on-chain vault restores. Returns how many
 *  conversations were merged. */
export function mergeChats(incoming: unknown): number {
  const chats = (Array.isArray(incoming) ? incoming : []).filter(
    (c): c is ArchivedChat =>
      Boolean(c) &&
      typeof c === 'object' &&
      typeof (c as ArchivedChat).id === 'string' &&
      typeof (c as ArchivedChat).title === 'string' &&
      Array.isArray((c as ArchivedChat).messages) &&
      (c as ArchivedChat).messages.every(valid),
  )
  const byId = new Map(readArchive().map((c) => [c.id, c]))
  for (const c of chats) byId.set(c.id, c)
  const merged = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt)
  writeArchive(merged)
  return chats.length
}
