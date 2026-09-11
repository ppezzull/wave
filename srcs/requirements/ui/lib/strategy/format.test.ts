// format tests — the shared mock/live display helpers. The ranking math is
// exercised elsewhere; these pin the string contracts the UI renders.
import { describe, it, expect } from 'vitest'
import { formatEth, formatUsd, formatRecency } from './format'

describe('formatEth', () => {
  it('renders wei at 18dp with fixed places', () => {
    expect(formatEth('2000000000000000000')).toBe('2.0 ETH')
    expect(formatEth('1234567890000000000', 18, 3)).toBe('1.235 ETH')
  })
  it('handles zero', () => {
    expect(formatEth('0')).toBe('0.0 ETH')
  })
})

describe('formatUsd', () => {
  it('rounds to K above $1k, M above $1M, plain below', () => {
    expect(formatUsd('1000000000000000000')).toBe('$3K') // 1 ETH → $3000 → K bucket
    expect(formatUsd('1000000000000000')).toBe('$3') // 0.001 ETH → plain bucket
    expect(formatUsd('1000000000000000000000')).toBe('$3.0M') // 1000 ETH
    expect(formatUsd('100000000000000000000')).toBe('$300K')
  })
  it('respects an explicit eth price', () => {
    expect(formatUsd('1000000000000000000', 2000)).toBe('$2K')
  })
  it('zero stays zero dollars', () => {
    expect(formatUsd('0')).toBe('$0')
  })
})

describe('formatRecency', () => {
  it('never swapped for the zero sentinel', () => {
    expect(formatRecency(0)).toBe('never swapped')
  })
  it('minutes, hours, days buckets', () => {
    const now = 1_780_100_000
    expect(formatRecency(now - 5 * 60, now)).toBe('last swap 5m ago')
    expect(formatRecency(now - 3 * 3600, now)).toBe('last swap 3h ago')
    expect(formatRecency(now - 2 * 86400, now)).toBe('last swap 2d ago')
  })
  it('future timestamps clamp to zero diff (no negative recency)', () => {
    const now = 1_780_100_000
    expect(formatRecency(now + 600, now)).toBe('last swap 0m ago')
  })
})
