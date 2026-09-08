// SPDX-License-Identifier: UNLICENSED
// Production wave mapping. Two data sources:
//   EnsStrategyRouter -> handleStrategyDeployed, handleSwapped
//   Aqua              -> handlePushed, handlePulled, handleDocked (committed capital + status)
// (The ENS resolver source and its follow handlers are REMOVED with the ENS layer — follows
// were ENS text records; World AgentKit owns identity now and stores no follow edges.)
// Reorg safety = graph-node native block-level revert (entity versions for a reverted block
// are undone, then re-indexed). Mutable aggregates (Strategy.*) are re-applied on re-index,
// so cumulativeVolume* / lastSwapTimestamp stay exact.
//
// CONTRACT-LAYER ASSUMPTION (D1, loud): the three handlers key the SAME Strategy row only if
//   Strategy.id == StrategyDeployed.strategyId == Swapped.orderHash == SwapVM.hash(order).
// `announceStrategy(bytes32 strategyId, bytes32)` takes a FREE-FORM strategyId; nothing on-chain
// binds it to hash(order). If the announcer passes a wrong id, this subgraph keys different rows
// for one real strategy (swaps get DROPPED — see F2 below). Coordinating announcer→hash(order) is
// a contract-layer task (Flaviano), tracked in docs/strategy/SUBGRAPH-CONTRACT-GAPS.md (C1).
// (The event's second indexed bytes32 was born the ENS namehash; the agent now passes the
// strategyId itself — we receive it and deliberately don't persist it.)
//
// Only handleStrategyDeployed creates Strategy rows (F2). Swapped/Aqua events that arrive before
// (or without) a deploy are dropped — no phantom strategies accumulate from non-wave SwapVM swaps.
// A re-index after deploy picks them up.

import { Bytes, BigInt } from "@graphprotocol/graph-ts";
import { StrategyDeployed, Swapped } from "../generated/EnsStrategyRouter/EnsStrategyRouter";
import { Pushed as AquaPushed, Pulled as AquaPulled, Docked as AquaDocked } from "../generated/Aqua/Aqua";
import { Strategy, Swap } from "../generated/schema";

const ACTIVE = "active";
const STOPPED = "stopped";
const ID_BYTES = 32; // a strategyId is a bytes32

function zeroBytes32(): Bytes {
  return Bytes.fromUint8Array(new Uint8Array(ID_BYTES));
}

// Create a Strategy ONLY from a StrategyDeployed event (F2). Swapped/Aqua handlers never call this.
function createStrategy(id: Bytes): Strategy {
  let s = new Strategy(id);
  s.programHash = zeroBytes32(); // tolerated until the compiler's programHash() lands
  s.status = ACTIVE;
  s.cumulativeVolumeIn = BigInt.zero();
  s.cumulativeVolumeOut = BigInt.zero();
  s.committedCapital = BigInt.zero(); // running balance; Aqua Pushed/Pulled maintain it
  s.swapCount = 0;
  s.lastSwapTimestamp = BigInt.fromI32(0);
  return s;
}

// --- (a) StrategyDeployed — the ONLY handler that creates Strategy rows ---
export function handleStrategyDeployed(event: StrategyDeployed): void {
  // programHash may be bytes32(0) until the compiler lands — Bytes! accepts zero, store as-is.
  let s = Strategy.load(event.params.strategyId);
  if (s == null) {
    s = createStrategy(event.params.strategyId);
  }
  s.programHash = event.params.programHash; // overwrites the placeholder 0 on real announce
  // event.params.ensNode (the third bytes32) is deliberately NOT persisted: it was the ENS
  // namehash, and with ENS gone the announcer passes the strategyId itself (opaque to the
  // router). Strategy.id already carries the join key — there is nothing to index here.
  // status: left as-is on re-announce (no stopped/removed event in this ABI yet).
  s.save();
}

// --- (a) Swapped — accumulates on an EXISTING Strategy only (no phantom rows) ---
export function handleSwapped(event: Swapped): void {
  // orderHash == SwapVM.hash(order) == Strategy.id (the join key).
  const s = Strategy.load(event.params.orderHash);
  if (s == null) {
    return; // no deploy seen for this strategy yet — drop the swap (F2). Re-index after deploy picks it up.
  }

  // Immutable Swap log row. id is a 36-byte composite (txHash || logIndex) — a unique key
  // only, NOT a bytes32; the strategy join is on `s.id` below, never on this id.
  const swap = new Swap(event.transaction.hash.concatI32(event.logIndex.toI32()));
  swap.strategy = s.id; // consumer filters swaps(where:{strategy:$id})
  swap.maker = event.params.maker;
  swap.taker = event.params.taker;
  swap.tokenIn = event.params.tokenIn;
  swap.tokenOut = event.params.tokenOut;
  swap.amountIn = event.params.amountIn;
  swap.amountOut = event.params.amountOut;
  swap.timestamp = event.block.timestamp; // consumer orderBy:timestamp
  swap.blockNumber = event.block.number;
  swap.transactionHash = event.transaction.hash;
  swap.save();

  // Mutate Strategy aggregates as BigInt (F4) — no decimal128 cap, no lost wei.
  s.cumulativeVolumeIn = s.cumulativeVolumeIn.plus(event.params.amountIn);
  s.cumulativeVolumeOut = s.cumulativeVolumeOut.plus(event.params.amountOut);
  s.swapCount = s.swapCount + 1;
  s.lastSwapTimestamp = event.block.timestamp;
  s.save();
}

// --- (c) Aqua balance-management events — committed capital + status ---
// Aqua (1inch's balance protocol) is the AUTHORITATIVE source of committed capital: it emits
// Pushed(amount) on every ship/push and Pulled(amount) on every withdrawal, keyed by
// strategyHash. Aqua.strategyHash == SwapVM.orderHash == Strategy.id (verified:
// test/helpers/AquaSwapVMHelper.sol:357 asserts assertEq(strategyHash, orderHash)), so these
// join the existing Strategy rows with no bridge. committedCapital is a running balance:
// Pushed adds, Pulled subtracts — so returnPct's denominator stays correct as capital moves.
// Docked flips status to "stopped" (the only status transition in this path).
// All three skip if no Strategy row exists yet (F2): a Pushed for a non-wave strategy, or one
// arriving before StrategyDeployed, is ignored — no phantom rows.

export function handlePushed(event: AquaPushed): void {
  const s = Strategy.load(event.params.strategyHash);
  if (s == null) {
    return; // not a deployed wave strategy — skip (F2)
  }
  s.committedCapital = s.committedCapital.plus(event.params.amount);
  s.save();
}

export function handlePulled(event: AquaPulled): void {
  const s = Strategy.load(event.params.strategyHash);
  if (s == null) {
    return; // not a deployed wave strategy — skip (F2)
  }
  // Guard against underflow: Aqua should never pull more than it pushed, but BigInt minus
  // would trap (abort the handler) on underflow. Clamp at 0 — a clamp is always safe here
  // because committedCapital is a lower bound on realized value, never negative.
  if (event.params.amount.gt(s.committedCapital)) {
    s.committedCapital = BigInt.zero();
  } else {
    s.committedCapital = s.committedCapital.minus(event.params.amount);
  }
  s.save();
}

export function handleDocked(event: AquaDocked): void {
  const s = Strategy.load(event.params.strategyHash);
  if (s == null) {
    return; // not a deployed wave strategy — skip (F2)
  }
  s.status = STOPPED; // Aqua Docked = maker withdrew the strategy → docked/dormant
  s.save();
}
