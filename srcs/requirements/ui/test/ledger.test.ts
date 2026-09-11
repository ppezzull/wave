// Ledger contract tests — the parity vector is the SAME literal the agent
// suite pins (agent/src/test/deployStrategy.test.ts). If this breaks, the
// two implementations drifted and every device signature would be rejected.
import { describe, it, expect } from 'vitest'
import { canonicalJson, actionHashOf, approvalMessage, toEip191Signature } from '@/lib/ledger'

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
    expect(approvalMessage('abc123', 'my strategy')).toBe('wave HITL approval [abc123] — my strategy')
  })
  it('caps the description at 200 chars (blind-signing territory beyond)', () => {
    const long = 'x'.repeat(300)
    const msg = approvalMessage('abc123', long)
    expect(msg.length).toBeLessThanOrEqual('wave HITL approval [abc123] — '.length + 201)
    expect(msg).toContain('…')
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
