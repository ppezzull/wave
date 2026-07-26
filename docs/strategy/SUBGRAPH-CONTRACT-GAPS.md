# Subgraph ↔ contract gaps (demo blockers)

The production subgraph (`subgraph/`) indexes what the on-chain contracts EMIT. Two contracts matter: `EnsStrategyRouter` (our deploy) and the Sepolia ENS Public Resolver (constant). This doc lists gaps where the subgraph cannot compute a needed value because the contract does not emit it — each one blocks a demo beat unless the contract changes OR the team accepts a degraded demo.

> Owner of resolution: **Flaviano** (contract) picks an option per gap; **Pietro** (UI) + **Flavio** (agent) consume the result. The subgraph author implements whatever the chosen option requires on the indexing side.

## C1 — bind `strategyId` to `hash(order)`

**Blocks:** feed identity, ranking, follower graph (everything keys on Strategy.id).

**Problem.** `announceStrategy(bytes32 strategyId, bytes32 ensNode)` takes a FREE-FORM `strategyId`. `Swapped` emits `orderHash = SwapVM.hash(order)`. Nothing binds them, so the subgraph's three handlers can key three different Strategy rows for one real strategy.

**Subgraph-side mitigation already shipped:** only `handleStrategyDeployed` creates Strategy rows (finding F2). So a mismatch shows up as "swaps/follows dropped" rather than "phantom strategies" — observable, not silent. But the demo still breaks if the announcer uses the wrong id. So C1a or C1b is still required.

**Options (Flaviano picks):**

| Option | Change | Trade-off |
|---|---|---|
| **C1a (preferred)** | Change `announceStrategy(ISwapVM.Order calldata order, bytes32 ensNode)` to derive `bytes32 id = hash(order)` on-chain and emit `StrategyDeployed(id, programHash, ensNode)`. Drop the free-form arg. | Removes the free-form arg entirely; the on-chain hash IS the id. ABI re-freeze required; Pietro/Flavio consume the new ABI. |
| **C1b (no contract change)** | Keep the signature; mandate in the announcer (Flavio's `register.ts` / Flaviano's deploy script) that `strategyId := SwapVM.hash(order)` always. | Cheaper, but relies on discipline — a wrong announcer call silently splits identity. Document as a hard rule in `docs/tasks/Flaviano.md` + `Flavio.md`. |

## C2 — emit committed capital so `returnPct` is computable — ✅ RESOLVED (no contract change)

**Blocks:** ~~the ranking formula (G2 acceptance: "feed sorts by the formula against live subgraph data").~~ Unblocked.

**Resolution (Flaviano, verified on-chain Jul 26):** the premise that "`aqua.ship` logs nothing" was **wrong**. Aqua itself emits committed capital via four events on `IAqua.sol:45-69`:

| Event | What it gives the subgraph |
|---|---|
| `Pushed(maker, app, strategyHash, token, amount)` | committed capital **per token** → add to `committedCapital` |
| `Pulled(maker, app, strategyHash, token, amount)` | a **withdrawal** → subtract from `committedCapital` (keeps the denominator correct over time) |
| `Docked(maker, app, strategyHash)` | strategy withdrawn → set `status = stopped` |
| `Shipped(maker, app, strategyHash, strategy)` | the strategy bytes |

The join key already matches with no bridge: `Aqua.strategyHash == SwapVM.orderHash == Strategy.id`, verified in-tree (`test/helpers/AquaSwapVMHelper.sol:357` asserts `assertEq(strategyHash, orderHash)`) and across two real Sepolia txs.

**Action shipped (separate PR, builds on #33):** Aqua is a **third subgraph data source**. `handlePushed`/`handlePulled` maintain `Strategy.committedCapital: BigInt!` as a running balance; `handleDocked` flips `status`. Better than any of the original options on four fronts: zero contract change / re-deploy; authoritative Aqua accounting (not our copy); includes withdrawals (a one-shot ship event wouldn't); and resolves `status` for free (the `mapping.ts` note "status left as-is, no stopped event in this ABI" is now obsolete via `Docked`). It also strengthens the "no database" story — the committed capital is what 1inch's protocol recorded, not a number we declare.

<details><summary>Original options (historical — superseded by the resolution above)</summary>

~~**Problem.** `returnPct = (realized + unrealized PnL) ÷ committed capital`. `aqua.ship(order, tokens, amounts)` registers the maker's liquidity (`amounts` = committed capital), but NO event carries those amounts. `Swapped.amountIn/Out` is swap FLOW, not the capital STOCK. The ranking denominator is undefined.~~

| Option | Change | Trade-off |
|---|---|---|
| ~~**C2a (preferred)**~~ | ~~Emit capital at ship time: add `StrategyShipped(...)` or extend `StrategyDeployed` with `uint256[] committedAmounts`.~~ | ~~Superseded — Aqua emits it natively; re-emitting would duplicate authoritative accounting.~~ |
| ~~**C2b**~~ | ~~Drop `returnPct`; rank by a proxy (`cumulativeVolumeOut/In` × recency × followers).~~ | ~~No longer needed.~~ |
| ~~**C2c**~~ | ~~UI reads `aqua.ship` off-chain via RPC.~~ | ~~No longer needed; would have violated "every field resolves to subgraph or ENS".~~ |

</details>

## C3 — emit real `programHash`

**Blocks:** the on-card hash-verify chip (demo Beat B).

**Problem.** `announceStrategy` emits `programHash = bytes32(0)` until the compiler's `programHash()` is wired. Every Strategy row has programHash=0 → the on-card hash-verify chip compares `keccak256(bytecode) != 0` and flags every card TAMPERED.

**Options:**

| Option | Change | Trade-off |
|---|---|---|
| **C3a (contract)** | Wire `programHash()` (Flaviano's compiler task, `Flaviano.md`) so `announceStrategy` emits the real hash. Then the UI removes the programHash==0 gate (D3). | Correct end state. |
| **C3b (UI gate, no contract change)** | The UI hash-verify chip skips verification (renders "pending") when `programHash == 0`. Already covered as D3 — implement the gate in the UI task, not here. | Ships now; chip is non-functional until C3a lands. |

---

## Related subgraph-side DOCUMENTATION-ONLY notes (already shipped in the subgraph, listed here for traceability)

- **D1:** `strategyId == orderHash` is the C1 coordination assumption (see above), now documented loudly at the top of `subgraph/src/mapping.ts` and `schema.graphql`.
- **D2 (resolved):** committed capital WAS thought unemitted → `returnPct` denominator undefined. **Resolved:** Aqua emits it (`Pushed`/`Pulled`), now indexed into `Strategy.committedCapital`. See C2 above.
- **D3:** `programHash` is `bytes32(0)` for every strategy until the compiler lands → the UI hash-verify chip must gate on `programHash != 0`. Noted in `subgraph/README.md`.
- **L1 (listing threshold):** a strategy ranks once it has `swapCount >= 3 AND (now - lastSwapTimestamp) >= 3600` seconds; before that it is listed but unranked. This is a CONSUMER-LAYER rule (applied in the UI `getFeed()` and the agent's feed query), NOT a subgraph field — graph-node has no computed/derived boolean that stays in sync without a block handler. The schema exposes raw `swapCount` and `lastSwapTimestamp`; both consumers implement the identical formula documented in `subgraph/README.md`.
