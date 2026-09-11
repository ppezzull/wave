// publish-signal tests — the World ID publish gate's load-bearing contract:
// browser and server MUST derive the same sha256 signal from the same
// {description, spec}, or the proof verifies against the wrong payload and
// the one-shot nullifier burns on a signal nobody can reproduce.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { canonicalJson, publishPayload, publishSignal } from './publish-signal'
import type { ShipStrategySpec } from '@/app/actions/ship'

const SPEC: ShipStrategySpec = {
  specVersion: 1,
  pair: { token0: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', token1: '0x779877A7B0D9E8603169DdbD7836e478b4624789' },
  size: { amount0: '1', amount1: '200' },
  blocks: [{ type: 'curve', kind: 'xyc' }, { type: 'salt', value: 9 }],
}

describe('canonicalJson', () => {
  it('is key-order independent at every level', () => {
    const a = { z: 1, a: { y: 2, b: 3 }, m: [1, 2] }
    const b = { a: { b: 3, y: 2 }, m: [1, 2], z: 1 }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })

  it('preserves array order (blocks are an ordered program)', () => {
    expect(canonicalJson({ blocks: [{ type: 'curve' }, { type: 'salt' }] })).not.toBe(
      canonicalJson({ blocks: [{ type: 'salt' }, { type: 'curve' }] }),
    )
  })

  it('handles primitives, null and nesting exactly', () => {
    expect(canonicalJson(null)).toBe('null')
    expect(canonicalJson(42)).toBe('42')
    expect(canonicalJson('x')).toBe('"x"')
    expect(canonicalJson({ b: 1, a: [{ z: true, y: null }] })).toBe('{"a":[{"y":null,"z":true}],"b":1}')
  })
})

describe('publishSignal', () => {
  it('is deterministic across calls (browser/server agreement)', async () => {
    const s1 = await publishSignal(SPEC, 'post body')
    const s2 = await publishSignal(SPEC, 'post body')
    expect(s1).toBe(s2)
    expect(s1).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('equals sha256 of the canonical payload, derived independently', async () => {
    // Independent construction via node:crypto — not the module's own code path.
    const expected = `0x${createHash('sha256')
      .update(canonicalJson(publishPayload(SPEC, 'post body')))
      .digest('hex')}`
    expect(await publishSignal(SPEC, 'post body')).toBe(expected)
  })

  it('changes when the description OR the spec changes (proof binds the exact payload)', async () => {
    const base = await publishSignal(SPEC, 'post body')
    expect(await publishSignal(SPEC, 'post body edited')).not.toBe(base)
    const otherSize: ShipStrategySpec = { ...SPEC, size: { amount0: '2', amount1: '400' } }
    expect(await publishSignal(otherSize, 'post body')).not.toBe(base)
  })
})
