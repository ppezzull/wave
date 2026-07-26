// SPDX-License-Identifier: UNLICENSED
// Production wave mapping. Two data sources:
//   EnsStrategyRouter -> handleStrategyDeployed, handleSwapped
//   ENSResolver       -> handleTextChanged (filtered to wave.following/<id>), handleVersionChanged
// Reorg safety = graph-node native block-level revert (entity versions for a reverted block
// are undone, then re-indexed). Mutable aggregates (Strategy.*, Follower, NodeFollows) are
// re-applied on re-index, so followerCount / cumulativeVolume* / lastSwapTimestamp stay exact.
//
// CONTRACT-LAYER ASSUMPTION (D1, loud): the three handlers key the SAME Strategy row only if
//   Strategy.id == StrategyDeployed.strategyId == Swapped.orderHash == SwapVM.hash(order).
// `announceStrategy(bytes32 strategyId,…)` takes a FREE-FORM strategyId; nothing on-chain binds it
// to hash(order). If the announcer passes a wrong id, this subgraph keys different rows for one
// real strategy (swaps/follows get DROPPED — see F2 below). Coordinating announcer→hash(order) is
// a contract-layer task (Flaviano), tracked in docs/strategy/SUBGRAPH-CONTRACT-GAPS.md (C1).
//
// Only handleStrategyDeployed creates Strategy rows (F2). Swapped/TextChanged that arrive before
// (or without) a deploy are dropped — no phantom strategies accumulate from non-wave SwapVM swaps
// or permissionless setText of a fake wave.following/<hex> key. A re-index after deploy picks
// them up.

import { Bytes, BigInt, store } from "@graphprotocol/graph-ts";
import { StrategyDeployed, Swapped } from "../generated/EnsStrategyRouter/EnsStrategyRouter";
import { TextChanged, VersionChanged } from "../generated/ENSResolver/ENSResolver";
import { Strategy, Swap, Follow, Follower, NodeFollows } from "../generated/schema";

const WAVE_FOLLOWING_PREFIX = "wave.following/";
const ACTIVE = "active";
const HEX_CHARS = "0123456789abcdefABCDEF";
const ID_BYTES = 32; // a strategyId / node is a bytes32

function zeroBytes32(): Bytes {
  return Bytes.fromUint8Array(new Uint8Array(ID_BYTES));
}

function emptyBytes(): Bytes {
  return Bytes.fromUint8Array(new Uint8Array(0));
}

// Validate the wave.following/<suffix> suffix into a 32-byte strategyId BEFORE handing it to
// Bytes.fromHexString. graph-ts fromHexString asserts EVEN length (aborts the handler BEFORE any
// guard) and silently maps non-hex chars to 0x00 — so an odd-length or all-garbage suffix (e.g.
// 64 'z's) would otherwise abort the handler or yield an all-zeros Bytes that passes a length
// check and creates a bogus zero-hash Strategy. We require EXACTLY 64 hex chars, no 0x prefix.
//
// We return a non-null Bytes (a 0-LENGTH sentinel on any rejection) rather than `Bytes | null`:
// comparing a `Bytes | null` union to `null` (the natural `if (x == null)`) crashes this
// toolchain's AS compiler in its binary-overload resolver (compileBinaryOverload assertion). The
// caller checks `result.length != ID_BYTES` instead — same semantics, no nullable-union compare.
function parseStrategyIdFromKey(key: string): Bytes {
  const suffix = key.slice(WAVE_FOLLOWING_PREFIX.length);
  if (suffix.length != 64) {
    return emptyBytes(); // 0-length sentinel = invalid
  }
  for (let i = 0; i < suffix.length; i++) {
    if (HEX_CHARS.indexOf(suffix.charAt(i)) == -1) {
      return emptyBytes(); // 0-length sentinel = invalid
    }
  }
  const id = Bytes.fromHexString("0x" + suffix);
  if (id.length != ID_BYTES) {
    return emptyBytes(); // 0-length sentinel = invalid (defense-in-depth)
  }
  return id;
}

// Create a Strategy ONLY from a StrategyDeployed event (F2). Swapped/TextChanged never call this.
function createStrategy(id: Bytes): Strategy {
  let s = new Strategy(id);
  s.programHash = zeroBytes32(); // tolerated until the compiler's programHash() lands
  s.ensNode = zeroBytes32();
  s.status = ACTIVE;
  s.cumulativeVolumeIn = BigInt.zero();
  s.cumulativeVolumeOut = BigInt.zero();
  s.swapCount = 0;
  s.lastSwapTimestamp = BigInt.fromI32(0);
  s.followerCount = 0;
  return s;
}

// --- NodeFollows array helpers ---
// `strategies` is Array<Bytes> — the followed strategy ids for a node. graph-ts can't
// query-by-field, so we keep this list by hand to enumerate on a bulk ENS clear.

function loadOrCreateNodeFollows(node: Bytes): NodeFollows {
  let nf = NodeFollows.load(node);
  if (nf != null) {
    return nf;
  }
  nf = new NodeFollows(node);
  let empty: Bytes[] = [];
  nf.strategies = empty;
  return nf;
}

function followedContains(arr: Array<Bytes>, strategyId: Bytes): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].equals(strategyId)) {
      return true;
    }
  }
  return false;
}

function followedAdd(arr: Array<Bytes>, strategyId: Bytes): Array<Bytes> {
  if (followedContains(arr, strategyId)) {
    return arr;
  }
  let next: Bytes[] = [];
  for (let i = 0; i < arr.length; i++) {
    next.push(arr[i]);
  }
  next.push(strategyId);
  return next;
}

function followedRemove(arr: Array<Bytes>, strategyId: Bytes): Array<Bytes> {
  let next: Bytes[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (!arr[i].equals(strategyId)) {
      next.push(arr[i]);
    }
  }
  return next;
}

// --- (a) StrategyDeployed — the ONLY handler that creates Strategy rows ---
export function handleStrategyDeployed(event: StrategyDeployed): void {
  // programHash may be bytes32(0) until the compiler lands — Bytes! accepts zero, store as-is.
  let s = Strategy.load(event.params.strategyId);
  if (s == null) {
    s = createStrategy(event.params.strategyId);
  }
  s.programHash = event.params.programHash; // overwrites the placeholder 0 on real announce
  s.ensNode = event.params.ensNode;
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

// --- (b) TextChanged on ENS Public Resolver, filtered to wave.following/<id> ---
export function handleTextChanged(event: TextChanged): void {
  // The on-chain indexed key topic is keccak256(key) — can't prefix-filter on-chain. The
  // UNHASHED key arg is available here, so filter in the mapping (Pietro.md L62).
  const key = event.params.key;
  if (!key.startsWith(WAVE_FOLLOWING_PREFIX)) {
    return;
  }

  // Validate the <strategyId> hex suffix BEFORE fromHexString (F1). Odd-length / non-hex /
  // wrong-size suffixes are rejected (parseStrategyIdFromKey returns a 0-length sentinel), not
  // stored against a bogus Strategy.
  const strategyId = parseStrategyIdFromKey(key);
  if (strategyId.length != ID_BYTES) {
    return; // invalid suffix — 0-length sentinel
  }

  const s = Strategy.load(strategyId);
  if (s == null) {
    return; // not a deployed strategy — drop the follow (F2). A permissionless setText of a
    // fake wave.following/<hex> can no longer pollute the Strategy table with phantoms.
  }

  // Immutable audit log: one row per follow-state-change event.
  const follow = new Follow(event.transaction.hash.concatI32(event.logIndex.toI32()));
  follow.node = event.params.node;
  follow.strategy = s.id;
  follow.strategyKey = key;
  follow.isFollowing = event.params.value != ""; // value=="" -> cleared -> unfollow
  follow.timestamp = event.block.timestamp;
  follow.blockNumber = event.block.number;
  follow.transactionHash = event.transaction.hash;
  follow.save();

  // Mutable uniqueness index for O(1) followerCount. edgeId = node || strategyId, so a
  // re-follow from the same node is a no-op on the count. Under reorg, graph-node reverts the
  // block atomically — the Follower create/delete, the NodeFollows update, and the
  // Strategy.followerCount inc/dec replay together, so the count is exact, never double-counted.
  const edgeId = event.params.node.concat(strategyId);
  const nf = loadOrCreateNodeFollows(event.params.node);
  if (event.params.value != "") {
    // follow
    if (Follower.load(edgeId) == null) {
      const f = new Follower(edgeId);
      f.node = event.params.node;
      f.strategy = s.id;
      f.since = event.block.timestamp;
      f.save();
      s.followerCount = s.followerCount + 1;
      s.save();
      nf.strategies = followedAdd(nf.strategies, strategyId);
      nf.save();
    }
    // else already following -> idempotent, no count change.
  } else {
    // unfollow (cleared key)
    if (Follower.load(edgeId) != null) {
      store.remove("Follower", edgeId.toHexString());
      s.followerCount = s.followerCount - 1;
      s.save();
      nf.strategies = followedRemove(nf.strategies, strategyId);
      nf.save();
    }
    // else spurious unfollow with no prior follow -> ignore.
  }
}

// --- (b) VersionChanged on ENS Public Resolver — fired by Resolver.clearRecords (a BULK clear
// that bumps recordVersions and emits VersionChanged, firing NO per-key TextChanged). Without
// this, a user who bulk-clears their profile silently unfollows every strategy while
// Follower rows linger and Strategy.followerCount drifts permanently high. We walk the NodeFollows
// `strategies` array to enumerate every strategy the node followed and tear each edge down cleanly.
export function handleVersionChanged(event: VersionChanged): void {
  const node = event.params.node;
  const nf = NodeFollows.load(node);
  if (nf == null) {
    return; // node never followed anything — nothing to clear.
  }
  // Walk a SNAPSHOT of the followed ids. We decrement Strategy.followerCount and remove Follower
  // rows; we do NOT mutate nf.strategies during the walk (the array is cleared once, below).
  const count = nf.strategies.length;
  for (let i = 0; i < count; i++) {
    const strategyId = nf.strategies[i];
    const edgeId = node.concat(strategyId);
    // Remove the Follower edge (if present) and decrement the strategy's count.
    if (Follower.load(edgeId) != null) {
      store.remove("Follower", edgeId.toHexString());
      const strat = Strategy.load(strategyId);
      // Nested ifs (not `strat != null && strat.followerCount > 0`): kept defensive — compound &&
      // in an if-condition can confuse this toolchain's AS binary-overload resolver.
      if (strat != null) {
        if (strat.followerCount > 0) {
          strat.followerCount = strat.followerCount - 1;
          strat.save();
        }
      }
    }
  }
  // Clear the reverse index — node now follows nothing.
  let cleared: Bytes[] = [];
  nf.strategies = cleared;
  nf.save();
}
