// wave — single source of truth for mock data.
//
// The field names and shapes here MIRROR the real production sources so that
// swapping mock -> real later is a drop-in change:
//   1. The Graph subgraph (Strategy, Swap, Follow, Follower entities)
//   2. ENS text records (avatar, description, com.twitter, wave.following/<id>,
//      and an agent-context/intent record carrying programHash + oracle band)
//
// Rule: store RAW values (wei strings, unix seconds, bytes32 hex). Never store
// display strings as the source of truth — the format helpers below derive
// them at render time, exactly like the real subgraph (BigInt wei + unix ts).

// The pure format helpers + ranking formula live in lib/strategy/format.ts
// (shared with the live data layer). Re-export them here so existing
// `@/lib/mock-data` imports keep working.
export {
  CURRENT_NOW,
  formatEth,
  formatUsd,
  formatRecency,
  returnPct,
  returnPctStr,
  recencyDecay,
  rank,
  isRanked,
  hashState,
  abbrevHash,
  ZERO_HASH,
  type HashState,
} from './strategy/format'

// Fixed "now" so the mock is deterministic (no Date.now() at module load that
// would break SSR/hydration). The real app passes Date.now() / 1000.
import { CURRENT_NOW, isRanked, rank, formatUsd } from './strategy/format'

export type StrategyStatus = 'active' | 'stopped' | 'removed'

// Safety verdict — 4 numbers computed off-chain from the bytecode (compiler output).
export interface SafetyReport {
  verdict: 'SAFE' | 'UNSAFE'
  monotonicity: number // 0..1, e.g. 0.97
  symmetry: string // '12 bps'
  guardTriggers: number // count
  skewVsCap: number // 0..1
  // Live path: the safety report isn't computed until the compiler/safety
  // tooling ships. Render "pending", never fabricate SAFE. (mock ignores this.)
  pending?: boolean
}

// One retune evidence entry (autonomous, driven by a subgraph entity delta).
export interface RetuneEntry {
  entity: string // short entity id, e.g. '0xAB12'
  delta: string // signed, e.g. '+0.003' / '-0.001'
  deltaPositive: boolean
  decision: 'Approved' | 'Denied'
  tx: string // tx hash, abbreviated for display
}

// Bytecode instruction (SwapVM program: [opcode][argsLen][args]).
export interface BytecodeInstruction {
  opcode: string // PUSH1, LOAD, CMP_GT, JUMP_IF, STORE, EMIT, HALT, ...
  length: string // hex, e.g. '0x01'
  args: string // hex args
}

export interface Strategy {
  // --- subgraph-sourced ---
  id: string // bytes32 hex, lowercase 0x...
  programHash: string // bytes32 hex; '0x0000...0000' = not yet wired (D3 gate)
  ensNode: string // bytes32 namehash hex
  status: StrategyStatus
  cumulativeVolumeIn: string // wei string (BigInt)
  cumulativeVolumeOut: string // wei string (BigInt)
  swapCount: number
  lastSwapTimestamp: number // unix seconds (0 = never)
  followerCount: number
  // --- ENS text-record-sourced (author identity + intent) ---
  authorHandle: string // e.g. 'alice.eth' (the authoring ENS name)
  description: string // ENS description record — IS the compile prompt, byte-for-byte
  // ENS agent-context record: the programHash the author committed to on-chain.
  // For an honest strategy this equals `programHash`; a tampered one diverges.
  ensProgramHash: string
  // --- derived off-chain (compiler + safety tooling) ---
  // GAP C2: committedCapital is not yet emitted on-chain; mock-only until contract change.
  committedCapital: string // wei string — DENOMINATOR of returnPct
  oracleBand: string // intent from the agent-context record, e.g. 'RSI 55 / 45'
  bytecode: BytecodeInstruction[]
  safety: SafetyReport
  retunes: RetuneEntry[]
}

export interface ENSProfile {
  handle: string // 'alice' (label; full name is handle + '.eth')
  name: string // 'alice.eth'
  displayName: string // ENS display record
  bio: string // ENS 'description' record
  avatarUrl: string // ENS 'avatar' record ('' = none -> render gradient)
  twitter: string // ENS 'com.twitter' record ('' = none)
  ensNode: string // bytes32 namehash
  followingCount: number
  followersCount: number
  strategyIds: string[] // ids of strategies authored by this name
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export const strategies: Strategy[] = [
  // 1 — alice ETH/USDC momentum. Highest return (~+247%). SAFE. verified.
  {
    id: '0x9f2c4a71d3e8b6045f1a9c8e2b7d0463a5f8c1e29d4b6073e8a12c5f9b3d7e604',
    programHash:
      '0x3a7f1c9e02d84b6f5a1e9c73d0b48f26a9c1e534d7b8069f2e4a15c8b3d9e072',
    ensProgramHash:
      '0x3a7f1c9e02d84b6f5a1e9c73d0b48f26a9c1e534d7b8069f2e4a15c8b3d9e072',
    ensNode:
      '0x1c8e4a09d3f7b6152e9c0d84b7f36a25c1e9438d7b06f2e5a4c19b8d3e7f0625',
    status: 'active',
    cumulativeVolumeIn: '40000000000000000000',
    cumulativeVolumeOut: '43065200000000000000', // (out-cap)/cap = +247.3%
    swapCount: 312,
    lastSwapTimestamp: CURRENT_NOW - 7200, // 2h ago
    followerCount: 389,
    authorHandle: 'alice.eth',
    description:
      'ETH/USDC momentum: buy when 4h RSI crosses 55 from below, sell when it crosses 45 from above, hard stop at 3% drawdown from entry. Only trades during high-volume windows.',
    committedCapital: '12400000000000000000', // 12.4 ETH
    oracleBand: 'RSI 55 / 45',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x37' },
      { opcode: 'LOAD', length: '0x02', args: '0x0001' },
      { opcode: 'CMP_GT', length: '0x02', args: '0x0037' },
      { opcode: 'JUMP_IF', length: '0x02', args: '0x00a3' },
      { opcode: 'PUSH1', length: '0x01', args: '0x2d' },
      { opcode: 'CMP_LT', length: '0x02', args: '0x002d' },
      { opcode: 'STORE', length: '0x02', args: '0x0002' },
      { opcode: 'EMIT', length: '0x01', args: '0x01' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.97,
      symmetry: '12 bps',
      guardTriggers: 3,
      skewVsCap: 0.04,
    },
    retunes: [
      {
        entity: '0xab12',
        delta: '+0.003',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0x1a2b...f3e4',
      },
      {
        entity: '0xcd34',
        delta: '-0.001',
        deltaPositive: false,
        decision: 'Denied',
        tx: '0x5c6d...a7b8',
      },
      {
        entity: '0xef56',
        delta: '+0.007',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0x9e0f...c1d2',
      },
    ],
  },

  // 2 — vitalik WBTC/USDC range-bound. +89.1%. SAFE. verified.
  {
    id: '0x2d6b8f14a0e37c95d1f8b26e4a9c0753f2e8d1b64a3c709e5f8b2d1a6c4e9037',
    programHash:
      '0x8b4e2c17f9a06d35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0653',
    ensProgramHash:
      '0x8b4e2c17f9a06d35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0653',
    ensNode:
      '0x4f9c2e18a3d07b65f1e9c48d2b70a36e5c1d9438b7f0625e4a19c8d3b7e0f265',
    status: 'active',
    cumulativeVolumeIn: '9000000000000000000',
    cumulativeVolumeOut: '9455000000000000000', // +89.1%
    swapCount: 87,
    lastSwapTimestamp: CURRENT_NOW - 9000, // 2h30m ago
    followerCount: 1204,
    authorHandle: 'vitalik.wave.eth',
    description:
      'WBTC/USDC range-bound: fade moves beyond 2 standard deviations, mean-revert with 1.5% target, guard triggers if spread exceeds 40bps.',
    committedCapital: '5000000000000000000', // 5.0 ETH
    oracleBand: '±2σ band',
    bytecode: [
      { opcode: 'PUSH2', length: '0x02', args: '0x00c8' },
      { opcode: 'LOAD', length: '0x02', args: '0x0003' },
      { opcode: 'SUB', length: '0x01', args: '0x02' },
      { opcode: 'CMP_GT', length: '0x02', args: '0x0028' },
      { opcode: 'JUMP_IF', length: '0x02', args: '0x0071' },
      { opcode: 'STORE', length: '0x02', args: '0x0004' },
      { opcode: 'EMIT', length: '0x01', args: '0x01' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.94,
      symmetry: '8 bps',
      guardTriggers: 2,
      skewVsCap: 0.02,
    },
    retunes: [
      {
        entity: '0x7b90',
        delta: '+0.002',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0x3f1e...b9c2',
      },
      {
        entity: '0xa1f2',
        delta: '+0.004',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0xc7d8...4a5b',
      },
    ],
  },

  // 3 — 0xdefi ARB/ETH cross-chain arb. NEGATIVE -12.4%. TAMPERED. UNSAFE.
  {
    id: '0x7c1e9a35b8f062d4e19c8b73a0d465f2e8c1b9047d3a6e5f8c2b1d9a4e6c0375',
    // On-chain hash DIFFERS from the ENS record hash -> hash-verify shows TAMPERED.
    programHash:
      '0xdead41c8f9027b65e1a8c47d20f9a63e5c1d94b8072f6e3a5c19d8b47e2f0000',
    ensProgramHash:
      '0x5c1e9a37b8f042d6e19c8b74a0d365f2e8c1b9047d3a6e5f8c2b1d9a4e6c0371',
    ensNode:
      '0x9a3c1e28d4f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2651',
    status: 'active',
    cumulativeVolumeIn: '2000000000000000000',
    cumulativeVolumeOut: '1839600000000000000', // -12.4%
    swapCount: 44,
    lastSwapTimestamp: CURRENT_NOW - 21600, // 6h ago
    followerCount: 34,
    authorHandle: '0xdefi.eth',
    description:
      'ARB/ETH cross-chain arb: detect price delta above 15bps, execute on cheapest leg first, timeout after 90s if second leg unavailable.',
    committedCapital: '2100000000000000000', // 2.1 ETH
    oracleBand: '15 bps delta',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x0f' },
      { opcode: 'LOAD', length: '0x02', args: '0x0005' },
      { opcode: 'CMP_GT', length: '0x02', args: '0x000f' },
      { opcode: 'JUMP', length: '0x02', args: '0x0055' },
      { opcode: 'PUSH2', length: '0x02', args: '0x005a' },
      { opcode: 'STORE', length: '0x02', args: '0x0006' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'UNSAFE',
      monotonicity: 0.61,
      symmetry: '140 bps',
      guardTriggers: 9,
      skewVsCap: 0.38,
    },
    retunes: [
      {
        entity: '0x33aa',
        delta: '-0.014',
        deltaPositive: false,
        decision: 'Denied',
        tx: '0x8b2c...1d0e',
      },
    ],
  },

  // 4 — quant MATIC/USDC breakout. +34.7%. SAFE. verified.
  {
    id: '0x4a8c2e17b9f036d5e1c8b74d20a9f635c1e8d94b8072f6e3a5c19d8b47e2f0654',
    programHash:
      '0x6d2e9a18c4f07b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0654',
    ensProgramHash:
      '0x6d2e9a18c4f07b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0654',
    ensNode:
      '0x2e8c1a49d3f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2653',
    status: 'active',
    cumulativeVolumeIn: '11000000000000000000',
    cumulativeVolumeOut: '11853600000000000000', // +34.7%
    swapCount: 156,
    lastSwapTimestamp: CURRENT_NOW - 14400, // 4h ago
    followerCount: 198,
    authorHandle: 'quant.wave.eth',
    description:
      'MATIC/USDC breakout: enter on 1h candle close above 20-day high, scale out in thirds at 2%, 4%, 8% targets.',
    committedCapital: '8800000000000000000', // 8.8 ETH
    oracleBand: '20d high',
    bytecode: [
      { opcode: 'PUSH2', length: '0x02', args: '0x0014' },
      { opcode: 'LOAD', length: '0x02', args: '0x0007' },
      { opcode: 'CMP_GT', length: '0x02', args: '0x0014' },
      { opcode: 'JUMP_IF', length: '0x02', args: '0x0088' },
      { opcode: 'PUSH1', length: '0x01', args: '0x02' },
      { opcode: 'MUL', length: '0x01', args: '0x03' },
      { opcode: 'STORE', length: '0x02', args: '0x0008' },
      { opcode: 'EMIT', length: '0x01', args: '0x01' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.91,
      symmetry: '18 bps',
      guardTriggers: 4,
      skewVsCap: 0.06,
    },
    retunes: [
      {
        entity: '0x5e11',
        delta: '+0.005',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0x2d4f...9a1b',
      },
      {
        entity: '0x8c22',
        delta: '-0.002',
        deltaPositive: false,
        decision: 'Denied',
        tx: '0x6e8a...3c5d',
      },
    ],
  },

  // 5 — marina OP/ETH DCA. +11.2%. UNRANKED (only 2 fills). SAFE.
  {
    id: '0x1b7d9a25c8f043e6d19c8b74a0f365e2c1d8b9047a3e6c5f8b2d1a9e4c60375f',
    programHash:
      '0x9e3c1a28d4f07b65e1c8b47d20f9a63e5c1d94b8072f6e3a5c19d8b47e2f0655',
    ensProgramHash:
      '0x9e3c1a28d4f07b65e1c8b47d20f9a63e5c1d94b8072f6e3a5c19d8b47e2f0655',
    ensNode:
      '0x3d9c1e28a4f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2654',
    status: 'active',
    cumulativeVolumeIn: '1250000000000000000',
    cumulativeVolumeOut: '1334400000000000000', // +11.2%
    swapCount: 2,
    lastSwapTimestamp: CURRENT_NOW - 1380, // 23m ago
    followerCount: 22,
    authorHandle: 'marina.eth',
    description:
      'OP/ETH accumulation: DCA in 0.1 ETH increments every 4h if price is below 30-day MA, pause if weekly drawdown exceeds 8%.',
    committedCapital: '1200000000000000000', // 1.2 ETH
    oracleBand: '30d MA',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x0a' },
      { opcode: 'LOAD', length: '0x02', args: '0x0009' },
      { opcode: 'CMP_LT', length: '0x02', args: '0x001e' },
      { opcode: 'JUMP_IF', length: '0x02', args: '0x0044' },
      { opcode: 'STORE', length: '0x02', args: '0x000a' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.88,
      symmetry: '22 bps',
      guardTriggers: 1,
      skewVsCap: 0.03,
    },
    retunes: [],
  },

  // 6 — alice (second strategy) ETH/DAI grid. +18.9%. SAFE. verified.
  {
    id: '0x8f2e9a18c4d06b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0656',
    programHash:
      '0x7f2e9a18c4d06b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0656',
    ensProgramHash:
      '0x7f2e9a18c4d06b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0656',
    ensNode:
      '0x1c8e4a09d3f7b6152e9c0d84b7f36a25c1e9438d7b06f2e5a4c19b8d3e7f0625',
    status: 'active',
    cumulativeVolumeIn: '3600000000000000000',
    cumulativeVolumeOut: '3923700000000000000', // +18.9%
    swapCount: 201,
    lastSwapTimestamp: CURRENT_NOW - 3600, // 1h ago
    followerCount: 121,
    authorHandle: 'alice.eth',
    description:
      'ETH/DAI grid: place limit orders at 0.5% intervals above and below current price, auto-rebalance every 6h.',
    committedCapital: '3300000000000000000', // 3.3 ETH
    oracleBand: '0.5% grid',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x05' },
      { opcode: 'LOAD', length: '0x02', args: '0x000b' },
      { opcode: 'ADD', length: '0x01', args: '0x01' },
      { opcode: 'STORE', length: '0x02', args: '0x000c' },
      { opcode: 'SUB', length: '0x01', args: '0x01' },
      { opcode: 'STORE', length: '0x02', args: '0x000d' },
      { opcode: 'EMIT', length: '0x01', args: '0x01' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.95,
      symmetry: '10 bps',
      guardTriggers: 2,
      skewVsCap: 0.05,
    },
    retunes: [
      {
        entity: '0x9d40',
        delta: '+0.006',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0x4b7c...e2f1',
      },
    ],
  },

  // 7 — alice (third strategy) stETH/ETH basis. +52.6%. SAFE. verified.
  {
    id: '0x6c3d9a71b8f042e5d19c8b74a0f365e2c1d8b9047a3e6c5f8b2d1a9e4c603760',
    programHash:
      '0x2b8f1c9e04d76b35a1e9c73d0b48f26a9c1e534d7b8069f2e4a15c8b3d9e0721',
    ensProgramHash:
      '0x2b8f1c9e04d76b35a1e9c73d0b48f26a9c1e534d7b8069f2e4a15c8b3d9e0721',
    ensNode:
      '0x1c8e4a09d3f7b6152e9c0d84b7f36a25c1e9438d7b06f2e5a4c19b8d3e7f0625',
    status: 'active',
    cumulativeVolumeIn: '15000000000000000000',
    cumulativeVolumeOut: '22890000000000000000', // +52.6%
    swapCount: 268,
    lastSwapTimestamp: CURRENT_NOW - 5400, // 1h30m ago
    followerCount: 210,
    authorHandle: 'alice.eth',
    description:
      'stETH/ETH basis: harvest the staking-yield spread when it widens beyond 30bps, unwind at 8bps, guard against depeg by halting if the peg slips past 1%.',
    committedCapital: '15000000000000000000', // 15.0 ETH
    oracleBand: '30 / 8 bps',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x1e' },
      { opcode: 'LOAD', length: '0x02', args: '0x000e' },
      { opcode: 'SUB', length: '0x01', args: '0x02' },
      { opcode: 'CMP_GT', length: '0x02', args: '0x001e' },
      { opcode: 'JUMP_IF', length: '0x02', args: '0x00b7' },
      { opcode: 'PUSH1', length: '0x01', args: '0x08' },
      { opcode: 'STORE', length: '0x02', args: '0x000f' },
      { opcode: 'EMIT', length: '0x01', args: '0x01' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.96,
      symmetry: '9 bps',
      guardTriggers: 2,
      skewVsCap: 0.03,
    },
    retunes: [
      {
        entity: '0xba71',
        delta: '+0.009',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0x7d1a...c4b3',
      },
      {
        entity: '0xce82',
        delta: '+0.002',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0x1f9e...8a02',
      },
    ],
  },

  // 8 — vitalik (second) ETH/USDT vol harvest. +63.4%. SAFE. verified.
  {
    id: '0x3e7c9a25b8f061d4e19c8b73a0d465f2e8c1b9047d3a6e5f8c2b1d9a4e6c0388',
    programHash:
      '0x5c2e9a18c4f07b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0658',
    ensProgramHash:
      '0x5c2e9a18c4f07b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0658',
    ensNode:
      '0x4f9c2e18a3d07b65f1e9c48d2b70a36e5c1d9438b7f0625e4a19c8d3b7e0f265',
    status: 'active',
    cumulativeVolumeIn: '20000000000000000000',
    cumulativeVolumeOut: '32680000000000000000', // +63.4%
    swapCount: 143,
    lastSwapTimestamp: CURRENT_NOW - 12600, // 3h30m ago
    followerCount: 640,
    authorHandle: 'vitalik.wave.eth',
    description:
      'ETH/USDT volatility harvest: sell realized-vs-implied premium when the gap exceeds 6 vol points, delta-hedge every hour, cut on a 2% adverse move.',
    committedCapital: '20000000000000000000', // 20.0 ETH
    oracleBand: '6 vol pts',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x06' },
      { opcode: 'LOAD', length: '0x02', args: '0x0010' },
      { opcode: 'CMP_GT', length: '0x02', args: '0x0006' },
      { opcode: 'JUMP_IF', length: '0x02', args: '0x0094' },
      { opcode: 'MUL', length: '0x01', args: '0x02' },
      { opcode: 'STORE', length: '0x02', args: '0x0011' },
      { opcode: 'EMIT', length: '0x01', args: '0x01' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.93,
      symmetry: '14 bps',
      guardTriggers: 3,
      skewVsCap: 0.07,
    },
    retunes: [
      {
        entity: '0xd1a3',
        delta: '+0.008',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0x9c3f...2e71',
      },
    ],
  },

  // 9 — quant (second) LINK/USDC trend. +27.9%. SAFE. verified.
  {
    id: '0x5a9c2e17b9f036d5e1c8b74d20a9f635c1e8d94b8072f6e3a5c19d8b47e2f0659',
    programHash:
      '0x4d2e9a18c4f07b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0659',
    ensProgramHash:
      '0x4d2e9a18c4f07b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0659',
    ensNode:
      '0x2e8c1a49d3f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2653',
    status: 'active',
    cumulativeVolumeIn: '7000000000000000000',
    cumulativeVolumeOut: '8953000000000000000', // +27.9%
    swapCount: 98,
    lastSwapTimestamp: CURRENT_NOW - 18000, // 5h ago
    followerCount: 132,
    authorHandle: 'quant.wave.eth',
    description:
      'LINK/USDC trend follow: go long when the 12h EMA crosses the 48h EMA and ADX is above 25, trail the stop at 1.5 ATR, flat when ADX falls below 20.',
    committedCapital: '7000000000000000000', // 7.0 ETH
    oracleBand: 'EMA 12 / 48',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x19' },
      { opcode: 'LOAD', length: '0x02', args: '0x0012' },
      { opcode: 'CMP_GT', length: '0x02', args: '0x0019' },
      { opcode: 'JUMP_IF', length: '0x02', args: '0x006c' },
      { opcode: 'PUSH1', length: '0x01', args: '0x14' },
      { opcode: 'CMP_LT', length: '0x02', args: '0x0014' },
      { opcode: 'STORE', length: '0x02', args: '0x0013' },
      { opcode: 'EMIT', length: '0x01', args: '0x01' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.9,
      symmetry: '16 bps',
      guardTriggers: 3,
      skewVsCap: 0.05,
    },
    retunes: [
      {
        entity: '0xe2b4',
        delta: '+0.004',
        deltaPositive: true,
        decision: 'Approved',
        tx: '0x5a7d...1b9c',
      },
      {
        entity: '0xf3c5',
        delta: '-0.003',
        deltaPositive: false,
        decision: 'Denied',
        tx: '0x8e0f...4d2a',
      },
    ],
  },

  // 10 — 0xdefi (second) GMX/ETH funding. -4.8%. UNSAFE. verified (honest loss).
  {
    id: '0x8b1e9a35b8f062d4e19c8b73a0d465f2e8c1b9047d3a6e5f8c2b1d9a4e6c0390',
    programHash:
      '0x3f2e9a18c4f07b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0660',
    ensProgramHash:
      '0x3f2e9a18c4f07b35e1c8b47d29f0a63e5c1d94b8072f6e3a5c19d8b47e2f0660',
    ensNode:
      '0x9a3c1e28d4f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2651',
    status: 'stopped',
    cumulativeVolumeIn: '3000000000000000000',
    cumulativeVolumeOut: '2856000000000000000', // -4.8%
    swapCount: 61,
    lastSwapTimestamp: CURRENT_NOW - 43200, // 12h ago
    followerCount: 41,
    authorHandle: '0xdefi.eth',
    description:
      'GMX/ETH funding capture: collect perp funding when the 8h rate is positive, hedge spot on the cheapest venue, exit if funding flips negative for two epochs.',
    committedCapital: '3000000000000000000', // 3.0 ETH
    oracleBand: '8h funding',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x00' },
      { opcode: 'LOAD', length: '0x02', args: '0x0014' },
      { opcode: 'CMP_GT', length: '0x02', args: '0x0000' },
      { opcode: 'JUMP_IF', length: '0x02', args: '0x004f' },
      { opcode: 'STORE', length: '0x02', args: '0x0015' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'UNSAFE',
      monotonicity: 0.72,
      symmetry: '96 bps',
      guardTriggers: 7,
      skewVsCap: 0.29,
    },
    retunes: [
      {
        entity: '0x44bb',
        delta: '-0.006',
        deltaPositive: false,
        decision: 'Denied',
        tx: '0x2c9e...7f10',
      },
    ],
  },

  // 11 — marina (second) ARB/USDC ladder. +6.3%. UNRANKED (age < 1h). SAFE.
  {
    id: '0x2c7d9a25c8f043e6d19c8b74a0f365e2c1d8b9047a3e6c5f8b2d1a9e4c603761',
    programHash:
      '0x1e3c1a28d4f07b65e1c8b47d20f9a63e5c1d94b8072f6e3a5c19d8b47e2f0661',
    ensProgramHash:
      '0x1e3c1a28d4f07b65e1c8b47d20f9a63e5c1d94b8072f6e3a5c19d8b47e2f0661',
    ensNode:
      '0x3d9c1e28a4f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2654',
    status: 'active',
    cumulativeVolumeIn: '800000000000000000',
    cumulativeVolumeOut: '850400000000000000', // +6.3%
    swapCount: 6,
    lastSwapTimestamp: CURRENT_NOW - 900, // 15m ago (unranked: age < 1h)
    followerCount: 14,
    authorHandle: 'marina.eth',
    description:
      'ARB/USDC ladder: stack bids at 1% steps under the weekly VWAP, take profit at the VWAP reclaim, pause new rungs if the drawdown exceeds 6%.',
    committedCapital: '800000000000000000', // 0.8 ETH
    oracleBand: 'weekly VWAP',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x01' },
      { opcode: 'LOAD', length: '0x02', args: '0x0016' },
      { opcode: 'CMP_LT', length: '0x02', args: '0x0001' },
      { opcode: 'JUMP_IF', length: '0x02', args: '0x0048' },
      { opcode: 'STORE', length: '0x02', args: '0x0017' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.86,
      symmetry: '24 bps',
      guardTriggers: 1,
      skewVsCap: 0.04,
    },
    retunes: [],
  },

  // 12 — quant (third) RETH/ETH carry. Just shipped: programHash not wired yet
  //      (D3 gate) -> hash-verify shows PENDING. UNRANKED (0 swaps).
  {
    id: '0x9d2e9a17b9f036d5e1c8b74d20a9f635c1e8d94b8072f6e3a5c19d8b47e2f0662',
    programHash: `0x${'0'.repeat(64)}`, // bytes32(0) -> pending
    ensProgramHash:
      '0x0a3c1a28d4f07b65e1c8b47d20f9a63e5c1d94b8072f6e3a5c19d8b47e2f0662',
    ensNode:
      '0x2e8c1a49d3f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2653',
    status: 'active',
    cumulativeVolumeIn: '0',
    cumulativeVolumeOut: '5000000000000000000', // no swaps yet -> ~0% effective
    swapCount: 0,
    lastSwapTimestamp: 0, // never swapped
    followerCount: 3,
    authorHandle: 'quant.wave.eth',
    description:
      'rETH/ETH carry: accumulate the liquid-staking premium on dips below the 7-day mean, redeem into ETH when the premium normalizes, hard cap at 5 ETH.',
    committedCapital: '5000000000000000000', // 5.0 ETH
    oracleBand: '7d mean',
    bytecode: [
      { opcode: 'PUSH1', length: '0x01', args: '0x07' },
      { opcode: 'LOAD', length: '0x02', args: '0x0018' },
      { opcode: 'CMP_LT', length: '0x02', args: '0x0007' },
      { opcode: 'STORE', length: '0x02', args: '0x0019' },
      { opcode: 'HALT', length: '0x00', args: '' },
    ],
    safety: {
      verdict: 'SAFE',
      monotonicity: 0.92,
      symmetry: '11 bps',
      guardTriggers: 0,
      skewVsCap: 0.02,
    },
    retunes: [],
  },
]

export const strategyById = (id: string): Strategy | undefined =>
  strategies.find((s) => s.id === id)

// ---------------------------------------------------------------------------
// ENS profiles
// ---------------------------------------------------------------------------

export const profiles: ENSProfile[] = [
  {
    handle: 'alice',
    name: 'alice.eth',
    displayName: 'Alice Chen',
    bio: 'On-chain momentum trader. 3y in DeFi. Building in public.',
    avatarUrl: '',
    twitter: 'alicechen',
    ensNode:
      '0x1c8e4a09d3f7b6152e9c0d84b7f36a25c1e9438d7b06f2e5a4c19b8d3e7f0625',
    followingCount: 142,
    followersCount: 389,
    strategyIds: [strategies[0].id, strategies[5].id, strategies[6].id],
  },
  {
    handle: 'vitalik',
    name: 'vitalik.eth',
    displayName: 'Vitalik',
    bio: 'WBTC/USDC range strategies. Fade the extremes.',
    avatarUrl:
      'https://images.pexels.com/photos/7135053/pexels-photo-7135053.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop',
    twitter: 'VitalikButerin',
    ensNode:
      '0x4f9c2e18a3d07b65f1e9c48d2b70a36e5c1d9438b7f0625e4a19c8d3b7e0f265',
    followingCount: 320,
    followersCount: 1204,
    strategyIds: [strategies[1].id, strategies[7].id],
  },
  {
    handle: '0xdefi',
    name: '0xdefi.eth',
    displayName: '0xDefi',
    bio: 'Cross-chain arb and funding capture. Sometimes it works, and I ship the losses too.',
    avatarUrl:
      'https://images.pexels.com/photos/7190857/pexels-photo-7190857.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop',
    twitter: '0xdefi',
    ensNode:
      '0x9a3c1e28d4f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2651',
    followingCount: 12,
    followersCount: 34,
    strategyIds: [strategies[2].id, strategies[9].id],
  },
  {
    handle: 'quant',
    name: 'quant.eth',
    displayName: 'Quant',
    bio: 'MATIC breakouts. Systematic entries only.',
    avatarUrl:
      'https://images.pexels.com/photos/5918384/pexels-photo-5918384.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop',
    twitter: 'quantwave',
    ensNode:
      '0x2e8c1a49d3f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2653',
    followingCount: 56,
    followersCount: 198,
    strategyIds: [strategies[3].id, strategies[8].id, strategies[11].id],
  },
  {
    handle: 'marina',
    name: 'marina.eth',
    displayName: 'Marina',
    bio: 'DCA accumulation and patient ladders. Long-term. Low fills, no drama.',
    avatarUrl:
      'https://images.pexels.com/photos/7244319/pexels-photo-7244319.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop',
    twitter: 'marina',
    ensNode:
      '0x3d9c1e28a4f07b65e1c9b48d2a70f36e5c1d9438b70625e4f19c8d3b7e0f2654',
    followingCount: 8,
    followersCount: 22,
    strategyIds: [strategies[4].id, strategies[10].id],
  },
]

export const profileByHandle = (handle: string): ENSProfile | undefined =>
  profiles.find((p) => p.handle === handle)

// The signed-in identity (mocked as alice), plus the Privy-managed wallet that
// owns the ENS name. Settings and the account chip read from here.
export const currentUser = {
  ...profiles[0],
  walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
}

export const profileByStrategyId = (id: string): ENSProfile | undefined =>
  profiles.find((p) => p.strategyIds.includes(id))

// ---------------------------------------------------------------------------
// Format / derivation helpers live in lib/strategy/format.ts (shared with the
// live data layer) and are re-exported at the top of this file. The mock-only
// derived accessors below read from the mock arrays.
// ---------------------------------------------------------------------------

// pre-sorted ranked strategies by rank() desc — used by /explore
export function rankedStrategies(now = CURRENT_NOW): Strategy[] {
  return strategies
    .filter((s) => isRanked(s, now))
    .sort((a, b) => rank(b, now) - rank(a, now))
}

export function unrankedStrategies(now = CURRENT_NOW): Strategy[] {
  return strategies.filter((s) => !isRanked(s, now))
}

// ---------------------------------------------------------------------------
// Aggregate profile stats, computed from the authored strategies (not stored).
// ---------------------------------------------------------------------------

export interface ProfileStats {
  totalReturnStr: string
  totalReturnPositive: boolean
  strategiesShipped: number
  totalVolume: string
  avgFills: number
}

export function profileStats(p: ENSProfile): ProfileStats {
  const authored = p.strategyIds
    .map((id) => strategyById(id))
    .filter((s): s is Strategy => Boolean(s))

  const totalCap = authored.reduce((n, s) => n + Number(s.committedCapital), 0)
  const totalOut = authored.reduce(
    (n, s) => n + Number(s.cumulativeVolumeOut),
    0
  )
  const totalRet = totalCap === 0 ? 0 : ((totalOut - totalCap) / totalCap) * 100
  const totalFills = authored.reduce((n, s) => n + s.swapCount, 0)

  return {
    totalReturnStr: `${totalRet >= 0 ? '+' : '-'}${Math.abs(totalRet).toFixed(1)}%`,
    totalReturnPositive: totalRet >= 0,
    strategiesShipped: authored.length,
    totalVolume: formatUsd(String(Math.round(totalOut))),
    avgFills: authored.length
      ? Math.round(totalFills / authored.length)
      : 0,
  }
}
