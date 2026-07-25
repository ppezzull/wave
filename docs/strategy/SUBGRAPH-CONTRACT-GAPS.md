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

## C2 — emit committed capital so `returnPct` is computable

**Blocks:** the ranking formula (G2 acceptance: "feed sorts by the formula against live subgraph data").

**Problem.** `returnPct = (realized + unrealized PnL) ÷ committed capital`. `aqua.ship(order, tokens, amounts)` registers the maker's liquidity (`amounts` = committed capital), but NO event carries those amounts. `Swapped.amountIn/Out` is swap FLOW, not the capital STOCK. The ranking denominator is undefined.

**Options (Flaviano picks, priority order):**

| Option | Change | Trade-off |
|---|---|---|
| **C2a (preferred)** | Emit capital at ship time: add `StrategyShipped(bytes32 indexed strategyId, address indexed token, uint256 amount)` (one per token) OR extend `StrategyDeployed` with a `uint256[] committedAmounts` payload. Subgraph adds a `committedCapital: BigInt!` field on Strategy and indexes it. | Denominator present; ranking formula works as specified. |
| **C2b (no contract change)** | Drop `returnPct` for the hackathon; rank by a proxy computable from existing data — e.g. `cumulativeVolumeOut / cumulativeVolumeIn` (output/input ratio = a return-per-trade proxy) × recencyDecay × follower term. | Less rigorous (turnover-ratio, not PnL-on-capital) but demoable now. Requires a `Pietro.md` spec edit + UI change. |
| **C2c (UI-side fallback)** | UI reads `aqua.ship` amounts off-chain via a one-time RPC call at strategy-discovery and passes them into the rank computation alongside the subgraph data. | Violates "every field resolves to subgraph or ENS" (Pietro.md acceptance) — the ENS judge may dock it. Document the compromise. |

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
- **D2:** committed capital is not emitted → `returnPct` denominator undefined (this is C2). Noted in `schema.graphql` near the volume fields and in `subgraph/README.md`.
- **D3:** `programHash` is `bytes32(0)` for every strategy until the compiler lands → the UI hash-verify chip must gate on `programHash != 0`. Noted in `subgraph/README.md`.
- **L1 (listing threshold):** a strategy ranks once it has `swapCount >= 3 AND (now - lastSwapTimestamp) >= 3600` seconds; before that it is listed but unranked. This is a CONSUMER-LAYER rule (applied in the UI `getFeed()` and the agent's feed query), NOT a subgraph field — graph-node has no computed/derived boolean that stays in sync without a block handler. The schema exposes raw `swapCount` and `lastSwapTimestamp`; both consumers implement the identical formula documented in `subgraph/README.md`.
