import { getThreadsByAuthor, getLatestChatVault } from '@/lib/data'
import { readSessionCookie } from '@/lib/session-cookie'
import { RequireSession } from '@/components/require-session'
import { ChatSelector } from './chat-selector'

// /chat — threads + vault status resolve on the server when the session
// cookie is present. The selector stays a client island for archive/vault
// writes. Account-only: signed-out visitors go to `/`.
export const dynamic = 'force-dynamic'

export default async function ChatPage() {
  const hint = await readSessionCookie()
  const [threads, vault] = hint?.address
    ? await Promise.all([
        getThreadsByAuthor(hint.address, 6).catch(() => []),
        getLatestChatVault(hint.address),
      ])
    : [undefined, undefined]

  return (
    <RequireSession>
      <ChatSelector
        initialThreads={hint?.address && threads ? { address: hint.address, threads } : undefined}
        initialVault={vault === undefined ? undefined : vault}
      />
    </RequireSession>
  )
}
