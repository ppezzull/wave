// Similarity tests — the "For you" feed is deterministic math over real
// descriptions; these pin the tokenizer, the cosine, and the ranking so the
// personalization can never silently degrade into a shuffle.
import { describe, it, expect } from 'vitest'
import {
  tokenizeDescription,
  termFreq,
  idfMap,
  cosine,
  matchFeed,
} from '@/lib/similarity'

const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'.toLowerCase()
const LINK = '0x779877A7B0D9E8603169DdbD7836e478b4624789'.toLowerCase()
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'.toLowerCase()

const OWN = {
  id: 'own-1',
  description: `Two-token liquidity strategy: token0 0x${'ff'.repeat(0)}${WETH.slice(2)} with 2 WETH, token1 ${LINK} with 400 LINK, constant-product xyk curve, maker fee 25 bps`,
}
const NEAR = {
  id: 'near-1',
  description: `Guarded two-token liquidity strategy: token0 ${WETH} with 2 WETH, token1 ${LINK} with 500 LINK, constant-product xyk curve, oracle guard on the ETH/USD feed, maker fee 25 bps`,
}
const FAR = {
  id: 'far-1',
  description: `USDC momentum: buy when 4h RSI crosses 55 from below, sell at 45. Hard stop at 3% drawdown on ${USDC}.`,
}

describe('tokenizeDescription', () => {
  it('keeps 0x addresses whole (lowercased) and out of the word stream', () => {
    const tokens = tokenizeDescription(`token0 ${WETH} with 2 WETH`)
    expect(tokens).toContain(WETH)
    expect(tokens.filter((t) => t === WETH)).toHaveLength(1)
    expect(tokens).toContain('weth')
    expect(tokens).toContain('2')
  })
  it('folds case and keeps numbers, drops single letters', () => {
    const tokens = tokenizeDescription('Maker Fee 25 BPS, a curve')
    expect(tokens).toContain('maker')
    expect(tokens).toContain('25')
    expect(tokens).toContain('bps')
    expect(tokens).not.toContain('a')
  })
  it('empty in, empty out', () => {
    expect(tokenizeDescription('')).toEqual([])
  })
})

describe('cosine + idf', () => {
  it('identical documents score 1, disjoint score 0', () => {
    const a = termFreq(tokenizeDescription(OWN.description))
    const b = termFreq(tokenizeDescription(OWN.description))
    const idf = idfMap([a, b])
    expect(cosine(a, a, idf)).toBeCloseTo(1, 5)
    const disjoint = termFreq(['zzz', 'qqq', 'vvv'])
    expect(cosine(a, disjoint, idf)).toBe(0)
  })
  it('downweights ubiquitous terms: sharing only a common word is a weak match', () => {
    const common = termFreq(['strategy', 'liquidity'])
    const docs = [
      termFreq(['strategy', 'liquidity', 'weth', 'xyc']),
      termFreq(['strategy', 'liquidity', 'rsi', 'momentum']),
      common,
      termFreq(['strategy', 'liquidity', 'oracle']),
      termFreq(['strategy', 'liquidity', LINK]),
    ]
    const idf = idfMap(docs)
    // 'strategy'/'liquidity' appear in every doc → idf weight ≈ 1 (min);
    // cosine over only shared-ubiquitous terms against a doc rich in
    // distinctive terms is well below 1.
    const score = cosine(common, docs[0]!, idf)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(0.7)
  })
})

describe('matchFeed — the For-you ranking', () => {
  it('ranks the similar strategy above the unrelated one and omits zero matches', () => {
    const matches = matchFeed({ own: [OWN], pool: [FAR, NEAR] })
    expect(matches[0]?.id).toBe('near-1')
    expect(matches[0]!.score).toBeGreaterThan(0.5)
    // FAR shares nothing distinctive (no WETH/LINK/xyc vocabulary) → omitted.
    expect(matches.find((m) => m.id === 'far-1')).toBeUndefined()
  })
  it('never recommends the profile own strategies back', () => {
    const matches = matchFeed({ own: [OWN, NEAR], pool: [OWN, NEAR, FAR] })
    expect(matches.find((m) => m.id === 'own-1')).toBeUndefined()
    expect(matches.find((m) => m.id === 'near-1')).toBeUndefined()
  })
  it('an own profile with no descriptions matches nothing', () => {
    expect(matchFeed({ own: [{ id: 'x', description: '' }], pool: [NEAR] })).toEqual([])
  })
  it('score is the MAX over multiple own descriptions, not the sum', () => {
    const otherOwn = { id: 'own-2', description: 'totally different dca plan' }
    const one = matchFeed({ own: [OWN], pool: [NEAR] })[0]!.score
    const two = matchFeed({ own: [OWN, otherOwn], pool: [NEAR] })[0]!.score
    // The extra unrelated profile doc shifts idf slightly, but the score must
    // stay the max (≈ one), never accumulate (a sum would roughly double it).
    expect(two).toBeGreaterThan(one - 0.05)
    expect(two).toBeLessThan(one + 0.05)
  })
})
