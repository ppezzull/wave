import { getRecentThreads, isMockMode } from '@/lib/data'
import { ChatThreads } from './chat-threads'
import { ChatThreadLoader } from './chat-thread-loader'

// Server component, split by data mode (frontend.md §8 — data resolves server-side
// where it can):
//   mock — the canned recent threads render fully server-side.
//   live — threads are the SESSION WALLET's authorships, and the wallet only
//          exists client-side (Privy), so a client loader fetches via listThreads.
export default async function ChatPage() {
  if (isMockMode()) {
    const threads = await getRecentThreads(6)
    return <ChatThreads threads={threads} />
  }
  return <ChatThreadLoader />
}
