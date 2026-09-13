// Session hint cookie — the server-side twin of resolveSession.
//
// The three doors live in the browser (Privy / Nano / localStorage). After
// useSessionUser settles, it mirrors { address, source } here so Server
// Components can run wallet-keyed reads (similar feed, threads, vault,
// avatar) during SSR instead of waiting on a client hook + server action.

import 'server-only'
import { cookies } from 'next/headers'
import type { SessionSource } from './session'

export const SESSION_COOKIE = 'wave-session'

export interface SessionCookie {
  address: string
  source: Exclude<SessionSource, null>
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const SOURCES = new Set(['privy', 'ledger', 'local'])

export async function readSessionCookie(): Promise<SessionCookie | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as { address?: unknown; source?: unknown }
    if (typeof o.address !== 'string' || !ADDRESS_RE.test(o.address)) return null
    if (typeof o.source !== 'string' || !SOURCES.has(o.source)) return null
    return { address: o.address, source: o.source as SessionCookie['source'] }
  } catch {
    return null
  }
}
