'use server'

// Mirror the resolved session into an httpOnly cookie so the next SSR
// request can run wallet-keyed reads without a client hook. Write-only
// from the browser; pages read via lib/session-cookie.ts.
import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session-cookie'
import type { SessionSource } from '@/lib/session'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const SOURCES = new Set(['privy', 'ledger', 'local'])

export async function syncSessionCookie(
  snap: { address: string; source: Exclude<SessionSource, null> } | null,
): Promise<void> {
  const jar = await cookies()
  if (
    !snap ||
    !ADDRESS_RE.test(snap.address) ||
    !snap.source ||
    !SOURCES.has(snap.source)
  ) {
    jar.delete(SESSION_COOKIE)
    return
  }
  jar.set(SESSION_COOKIE, JSON.stringify({ address: snap.address, source: snap.source }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}
