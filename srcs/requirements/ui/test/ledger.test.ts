// Ledger contract tests — the parity vector is the SAME literal the agent
// suite pins (agent/src/test/deployStrategy.test.ts). If this breaks, the
// two implementations drifted and every device signature would be rejected.
import { describe, it, expect } from 'vitest'
import { canonicalJson, actionHashOf, approvalMessage, toEip191Signature } from '@/lib/ledger'
import { classifyLedgerFailure } from '@/lib/ledger-errors'
import { LEDGER_LOG, ledgerLog, ledgerLogDump } from '@/lib/ledger-log'

const VECTOR_SPEC = {
  specVersion: 1,
  pair: {
    token0: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    token1: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
  },
  size: { amount0: '1', amount1: '200' },
  blocks: [{ type: 'curve', kind: 'xyc' }],
}

describe('canonicalJson', () => {
  it('is key-order independent at every level', () => {
    const a = { z: 1, a: { y: 2, b: 3 }, m: [1, 2] }
    const b = { a: { b: 3, y: 2 }, m: [1, 2], z: 1 }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })
  it('preserves array order (blocks are an ordered program)', () => {
    expect(canonicalJson({ b: [{ t: 1 }, { t: 2 }] })).not.toBe(canonicalJson({ b: [{ t: 2 }, { t: 1 }] }))
  })
})

describe('actionHashOf — cross-package parity', () => {
  it('matches the agent-pinned vector (042b8b2f…)', async () => {
    // The agent suite pins the SAME literal — change both or neither.
    expect(await actionHashOf(VECTOR_SPEC)).toBe('042b8b2f3874563dd943ea50c712a14c')
  })
  it('changes when the spec changes (proof binds the exact payload)', async () => {
    const other = { ...VECTOR_SPEC, size: { amount0: '2', amount1: '400' } }
    expect(await actionHashOf(other)).not.toBe(await actionHashOf(VECTOR_SPEC))
  })
})

describe('approvalMessage', () => {
  it('embeds the hash and the description', () => {
    expect(approvalMessage('abc123', 'my strategy')).toBe('wave HITL approval [abc123] -- my strategy')
  })
  it('caps the description at 200 chars (blind-signing territory beyond)', () => {
    const long = 'x'.repeat(300)
    const msg = approvalMessage('abc123', long)
    expect(msg.length).toBeLessThanOrEqual('wave HITL approval [abc123] -- '.length + 200)
    expect(msg).not.toContain('…')
  })
  it('is strictly ASCII — the em-dash that desynced the APDU on the fork is filtered', () => {
    const msg = approvalMessage('abc123', 'a — b')
    // The property the APDU framing needs: byte length == string length, so
    // the kit's string-length prefix can never disagree with the UTF-8 body.
    expect(msg).toMatch(/^[\x20-\x7e]+$/)
    expect(new TextEncoder().encode(msg).length).toBe(msg.length)
    expect(msg).toContain('[abc123] -- a')
    expect(msg.endsWith('b')).toBe(true)
  })
})

describe('toEip191Signature', () => {
  const r = '0x' + 'ab'.repeat(32)
  const s = '0x' + 'cd'.repeat(32)
  it('assembles 65 bytes with yParity (v as 0/1)', () => {
    const sig = toEip191Signature({ r, s, v: 1 })
    expect(sig).toBe(`0x${'ab'.repeat(32)}${'cd'.repeat(32)}01`)
    expect((sig.length - 2) / 2).toBe(65)
  })
  it('normalizes legacy v 27/28 and EIP-155 v≥35 to yParity', () => {
    expect(toEip191Signature({ r, s, v: 27 }).slice(-2)).toBe('00')
    expect(toEip191Signature({ r, s, v: 28 }).slice(-2)).toBe('01')
    expect(toEip191Signature({ r, s, v: 37 }).slice(-2)).toBe('00') // 37-35=2 → parity 0
  })
  it('pads short r/s to 32 bytes', () => {
    const sig = toEip191Signature({ r: '0x1', s: '0x2', v: 0 })
    expect(sig.slice(2, 66)).toBe('1'.padStart(64, '0'))
  })
})

describe('classifyLedgerFailure — every DMK / WebHID outcome', () => {
  const tag = (_tag: string, extra: Record<string, unknown> = {}) => ({ _tag, ...extra })

  it('treats device refuse as rejected, not an error', () => {
    const r = classifyLedgerFailure(tag('RefusedByUserDAError'))
    expect(r.kind).toBe('rejected')
    expect(r.reason).toMatch(/Cancelled on device/)
    expect(r.clearSession).toBe(false)
  })

  it('treats buried status words 5501/6985/6982 as rejection', () => {
    for (const code of ['5501', '6985', '6982']) {
      const r = classifyLedgerFailure({ _tag: 'UnknownDeviceExchangeError', originalError: { errorCode: code } })
      expect(r.kind).toBe('rejected')
      expect(r.clearSession).toBe(false)
    }
  })

  it('names 6980 and the empty sign reply honestly — never a disconnect', () => {
    // Fork-evidence shapes: UnknownDeviceExchangeError wrapping errorCode 6980,
    // and InvalidStatusWordError "no signature returned" (empty 0x9000 reply).
    const r = classifyLedgerFailure({
      _tag: 'UnknownDeviceExchangeError',
      originalError: { errorCode: '6980' },
    })
    expect(r.kind).toBe('error')
    expect(r.reason).toMatch(/6980|blind signing/i)
    expect(r.reason).not.toMatch(/disconnected|reconnect/i)
    expect(r.clearSession).toBe(false)
    const empty = classifyLedgerFailure(tag('InvalidStatusWordError'))
    expect(empty.reason).toMatch(/unexpected status/)
    expect(empty.reason).not.toMatch(/^Unexpected Ledger error/)
  })

  it('names an unplug instead of the generic unexpected error', () => {
    for (const t of [
      'DeviceDisconnectedWhileSendingError',
      'DeviceDisconnectedBeforeSendingApdu',
      'DisconnectError',
      'DeviceSessionNotFound',
      'ReconnectionFailedError',
      'SessionDead',
    ]) {
      const r = classifyLedgerFailure(tag(t))
      expect(r.kind).toBe('error')
      expect(r.clearSession).toBe(true)
      expect(r.reason).not.toMatch(/^Unexpected Ledger error/)
      expect(r.reason).toMatch(/disconnected|session expired|reconnect/i)
    }
  })

  it('names picker-closed, locked, missing app, blind-sign, timeouts', () => {
    expect(classifyLedgerFailure(tag('NoAccessibleDeviceError')).reason).toMatch(/No Ledger was selected/)
    expect(classifyLedgerFailure(tag('DeviceLockedError')).reason).toMatch(/locked/i)
    expect(classifyLedgerFailure({ errorCode: '5515' }).reason).toMatch(/locked/i)
    expect(classifyLedgerFailure({ errorCode: '6807' }).reason).toMatch(/not installed/i)
    expect(classifyLedgerFailure({ errorCode: '6a80' }).reason).toMatch(/Blind signing/i)
    expect(classifyLedgerFailure(tag('DiscoveryTimeout')).reason).toMatch(/No Ledger found/)
    expect(classifyLedgerFailure(tag('ApprovalTimeout')).reason).toMatch(/did not confirm/)
    expect(classifyLedgerFailure({ name: 'TimeoutError', message: 'Timeout has occurred' }).reason).toMatch(/timed out/i)
  })

  it('names browser HID denials and unsupported transport', () => {
    expect(classifyLedgerFailure({ name: 'NotAllowedError' }).reason).toMatch(/denied/)
    expect(classifyLedgerFailure({ name: 'SecurityError' }).reason).toMatch(/blocked/)
    expect(classifyLedgerFailure(tag('TransportNotSupportedError')).reason).toMatch(/Chrome/)
  })

  it('names busy, firmware, memory, and comms failures without falling through', () => {
    const tagged = [
      'AlreadySendingApduError',
      'SendApduConcurrencyError',
      'DeviceBusyTimeout',
      'UnsupportedFirmwareDAError',
      'UnsupportedApplicationDAError',
      'OutOfMemoryDAError',
      'SendApduEmptyResponseError',
      'FramerApduError',
      'ReceiverApduError',
      'InvalidStatusWordError',
      'DeviceNotOnboardedError',
      'UnknownDeviceError',
      'NetworkDAError',
    ]
    for (const t of tagged) {
      const r = classifyLedgerFailure(tag(t))
      expect(r.reason, t).not.toMatch(/^Unexpected Ledger error/)
    }
  })

  it('unknown tags still include the tag so the screen is not opaque', () => {
    const r = classifyLedgerFailure(tag('SomeFutureLedgerError'))
    expect(r.kind).toBe('error')
    expect(r.clearSession).toBe(true)
    expect(r.reason).toContain('SomeFutureLedgerError')
  })

  it('string-matches disconnect when the SDK only gives a message', () => {
    const r = classifyLedgerFailure(new Error('device disconnected while sending'))
    expect(r.clearSession).toBe(true)
    expect(r.reason).toMatch(/disconnected/i)
  })
})

describe('ledgerLog — runtime evidence trail', () => {
  it('records a step we can dump after a failed ship', () => {
    const ev = ledgerLog('test.step', { tag: 'DeviceSessionNotFound' })
    expect(ev.step).toBe('test.step')
    expect(ev.tag).toBe('DeviceSessionNotFound')
    expect(ledgerLogDump().some((e) => e.step === 'test.step')).toBe(true)
    expect(LEDGER_LOG).toBe('[wave:ledger]')
  })
})
