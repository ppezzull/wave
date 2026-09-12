import { ChatSelector } from './chat-selector'

// /chat — the conversation SELECTOR (the chat itself is the floating widget:
// pick a thread → the widget opens replaying it). Threads are the session
// wallet's on-chain authorships; the wallet resolves client-side (Privy), so
// the selector is a client loader — never a fabricated list, never a fallback
// to all strategies.
export const dynamic = 'force-dynamic'

export default function ChatPage() {
  return <ChatSelector />
}
