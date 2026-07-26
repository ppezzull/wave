import { getRecentThreads } from '@/lib/data'
import { ChatThreads } from './chat-threads'

// Server-resolved thread list (the user's shipped strategies are the only
// persistent object in the no-DB design). The drawer + recency are client-side.
export default async function ChatPage() {
  const threads = await getRecentThreads(6)
  return <ChatThreads threads={threads} />
}
