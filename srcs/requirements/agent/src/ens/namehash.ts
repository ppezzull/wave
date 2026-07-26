// ENS name hashing. Re-exports viem's `namehash` / `normalize` (from viem/ens — verified
// via context7) so callers import one place, and ensures the `bytes32 ensNode` carried by
// `StrategyDeployed(strategyId, programHash, ensNode)` is computed IDENTICALLY here and in
// the router's emitter (P1) — resolveVerify compares like with like.
// Spec: docs/strategy/ENS-PATH.md §4 ("compute node with namehash identically here and in
// the router's emitter").
export { labelhash, namehash, normalize } from "viem/ens";

import { namehash } from "viem/ens";

/**
 * The `ensNode` for a strategy subname = namehash(normalize(subname)). This MUST equal the
 * `bytes32 ensNode` the router emits in `StrategyDeployed` — both sides normalize + hash
 * the same subname string. Use this wherever a strategy is keyed by its ENS node.
 */
export const ensNode = (subname: string): `0x${string}` => namehash(subname);
