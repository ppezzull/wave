// Runtime evidence for the device HITL walk. Console + in-memory ring +
// sessionStorage so a failed ship can be read back without guessing.
// Hypho ledger-protocol verify rule: no "should" — keep the raw step trail.

export const LEDGER_LOG = '[wave:ledger]'
export const LEDGER_LOG_KEY = 'wave:ledger:log'

export interface LedgerLogEvent {
  t: number
  step: string
  [key: string]: unknown
}

const RING_CAP = 80
const ring: LedgerLogEvent[] = []

type WaveLedgerDump = {
  dump: () => LedgerLogEvent[]
  last: () => LedgerLogEvent | undefined
}

declare global {
  interface Window {
    __WAVE_LEDGER?: WaveLedgerDump
  }
}

function persist() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(LEDGER_LOG_KEY, JSON.stringify(ring.slice(-RING_CAP)))
  } catch {
    // quota / private mode — console still has the trail
  }
  window.__WAVE_LEDGER = {
    dump: () => ring.slice(),
    last: () => ring[ring.length - 1],
  }
}

export function ledgerLog(step: string, extra: Record<string, unknown> = {}): LedgerLogEvent {
  const ev: LedgerLogEvent = { t: Date.now(), step, ...extra }
  ring.push(ev)
  if (ring.length > RING_CAP) ring.shift()
  persist()
  console.info(LEDGER_LOG, step, extra)
  return ev
}

export function ledgerLogError(step: string, err: unknown, extra: Record<string, unknown> = {}): LedgerLogEvent {
  const ev = ledgerLog(step, { ...extra, err })
  console.warn(LEDGER_LOG, step, extra, err)
  return ev
}

export function ledgerLogDump(): LedgerLogEvent[] {
  return ring.slice()
}

export function summarizeSession(state: unknown): Record<string, unknown> {
  const s = (state ?? {}) as {
    deviceStatus?: string
    currentApp?: { name?: string; version?: string }
  }
  return {
    deviceStatus: s.deviceStatus,
    app: s.currentApp?.name,
    appVersion: s.currentApp?.version,
  }
}
