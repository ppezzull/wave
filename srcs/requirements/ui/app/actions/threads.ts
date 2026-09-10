'use server'

// listThreads — the live /chat loader's fetch. Threads are the session wallet's
// shipped strategies (its on-chain authorships, keyed by the factory-attributed
// address), resolved server-side through the data facade. The client invokes it
// once Privy resolves the wallet (frontend.md §8 — no business logic client-side).
import { getThreadsByAuthor, type Strategy } from '@/lib/data'

/** The wallet's threads, newest activity first. Never throws: a subgraph blip or a
 *  malformed address renders an honest empty list, not a crashed page. */
export async function listThreads(address: string): Promise<Strategy[]> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return []
  try {
    return await getThreadsByAuthor(address, 6)
  } catch (err) {
    console.warn('[listThreads]', err)
    return []
  }
}
