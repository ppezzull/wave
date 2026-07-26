# wave subgraph

The Graph subgraph for **wave** — indexes the on-chain data the feed and the retune agent read. There is **no database**; `getFeed()` and `graphDelta` query this subgraph + ENS resolve, nothing else. See [`docs/spikes/GRAPH-NODE-SPIKE.md`](../../../docs/spikes/GRAPH-NODE-SPIKE.md) for the indexing-path decision (decentralized network vs self-hosted `graph-node` vs `eth_getLogs`).

## Status — production subgraph LIVE on Studio (v0.0.2)

**Two layers:**
- **v0.0.2 (deployed, live — production)** — two data sources (`EnsStrategyRouter` @ `0xeb513fd18c391fae1513ff12c1f97bf659d052c4` startBlock `11350046` + ENS resolver), entities `Strategy` / `Swap` / `Follow` / `Follower`. Queryable now; currently empty while syncing / before any swaps or announces are fired (expected). Query: `https://api.studio.thegraph.com/query/1756983/wave/v0.0.2`.
- **v0.0.1 (historical)** — the spike: single ENS-resolver `TextChanged` source, `textRecordChangeds` entity. Proved path A (decentralized network indexes Sepolia EVM with ~zero lag). Superseded by v0.0.2; kept on Studio for reference.

| | |
|---|---|
| **Studio page** | https://thegraph.com/studio/subgraph/wave |
| **Query endpoint (v0.0.2, live)** | `https://api.studio.thegraph.com/query/1756983/wave/v0.0.2` |
| **Query endpoint (v0.0.1, historical)** | `https://api.studio.thegraph.com/query/1756983/wave/v0.0.1` |

**See also:** contract-layer gaps that block the demo (strategyId binding, committed capital, programHash) — see [`SUBGRAPH-CONTRACT-GAPS.md`](../../../docs/strategy/SUBGRAPH-CONTRACT-GAPS.md).

### Production entities (v0.0.2, live) — matches the agent client (`srcs/requirements/agent/src/clients/subgraph.ts`)

- **`Strategy`** (mutable): `id` (= orderHash), `programHash` (tolerates `bytes32(0)`), `ensNode`, `status`, ranking aggregates `cumulativeVolumeIn/Out`, **`committedCapital`**, `swapCount`, `lastSwapTimestamp`, `followerCount`.
  - **`cumulativeVolumeIn/Out` are `BigInt`, not `BigDecimal`** — GraphQL decimal128 caps at 34 significant figures and loses wei; the UI converts to `BigDecimal` at read time.
  - **`committedCapital` is sourced from Aqua** (`Pushed` − `Pulled`, keyed by `strategyHash == Strategy.id`) — `returnPct`'s denominator. Maintained as a running balance, so it stays correct as capital enters/leaves. No contract change was needed (C2 resolved); see [`SUBGRAPH-CONTRACT-GAPS.md`](../../../docs/strategy/SUBGRAPH-CONTRACT-GAPS.md) C2.
  - **`programHash` is `bytes32(0)`** for every strategy until the compiler lands → the UI hash-verify chip must gate on `programHash != 0` (D3); see [`SUBGRAPH-CONTRACT-GAPS.md`](../../../docs/strategy/SUBGRAPH-CONTRACT-GAPS.md) C3.
- **`Swap`** (immutable): `strategy` (join key = `Swapped.orderHash`), `amountIn/Out`, `timestamp`, … The client filters `swaps(where:{strategy:$id})`.
- **`Follow`** (immutable log): one row per `wave.following/<id>` `TextChanged` event.
- **`Follower`** (mutable index): `id = node‖strategyId` — makes `followerCount` O(1) per event, reorg-exact.

**Join key:** `Strategy.id` == `StrategyDeployed.strategyId` == `Swapped.orderHash` == `SwapVM.hash(order)`.

**Ranking (`Pietro.md` 🔢):** `rank = returnPct × recencyDecay × (1 + log2(1 + followers))` — the UI computes this from `cumulativeVolume*`, `lastSwapTimestamp`, and `followerCount` exposed above. Every term is subgraph-sourced → still no database.

> **v0.0.2 was deployed** by: setting the live `EnsStrategyRouter` address + startBlock `11350046` in `subgraph.yaml` → `graph deploy wave --studio` (label `v0.0.2`) → bumping the agent client's `SUBGRAPH_URL` default to `…/wave/v0.0.2`. **When #41 (Aqua data source) merges, re-deploy as `v0.0.3` and bump the client URL again.**

## Build (verified green)

```bash
cd srcs/requirements/subgraph
npm install
npx graph codegen    # ✔ Types generated successfully
npx graph build      # ✔ Build completed: build/subgraph.yaml
```

## Layout

```
srcs/requirements/subgraph/
├── schema.graphql        # TextRecordChanged @entity(immutable) — the spike entity
├── subgraph.yaml         # specVersion 1.3.0, network: sepolia, ENSResolver data source
├── src/mapping.ts        # handleTextChanged — reorg-safe composite id (txHash+logIndex)
├── abis/ENSResolver.json # TextChanged event ABI fragment
└── package.json
```

## Deploy (path A — Subgraph Studio / decentralized network)

```bash
graph auth --studio <DEPLOY_KEY>
graph deploy --node https://api.studio.thegraph.com/deploy/ wave --network sepolia
```

If Studio can't index Sepolia EVM reliably → self-host `graph-node` (path B), see the spike doc.

## The follower-count trick (why two data sources)

ENS is forward-only — given a name you can read its records, but there's no reverse index from a record value back to which names hold it. So:

- `followStrategy()` writes a `wave.following/<strategy>` text record on the **follower's** own name.
- This subgraph indexes the resolver's `TextChanged` events, filters `key.startsWith("wave.following/")` in the mapping (the on-chain topic is a keccak hash, so prefix-filter happens off-chain), and counts distinct emitter nodes per strategy → `followerCount`, the third term of the rank formula.

That's why the real subgraph indexes **two contracts**: our `StrategyRouter` **and** the Sepolia ENS Public Resolver.

## Listing threshold (consumer-layer rule)

A strategy **ranks** once it has `swapCount >= 3` **AND** `now - lastSwapTimestamp >= 3600` (seconds). Before that it is **listed but unranked**.

This rule is applied at the **CONSUMER layer** (UI `getFeed()` and the agent feed query), **not in the subgraph** — graph-node has no derived boolean that stays in sync without a block handler. The schema exposes raw `swapCount` and `lastSwapTimestamp`; both consumers MUST implement the identical formula to agree on what "exists/ranks".

The shared consumer-layer math — `rank = returnPct × recencyDecay × (1 + log2(1 + followers))` over these raw wei-string aggregates — lives in [`srcs/requirements/agent/src/ranking.ts`](../agent/src/ranking.ts) (pure, BigInt-safe, tested). The future UI `getFeed()` and any agent-side feed sort call it; do not re-implement the formula.

## Composable upside — a standardized Aqua-strategy index

The SwapVM/Aqua core of this subgraph (`Swap`, per-strategy volume aggregates, Aqua-sourced `committedCapital`) is **generic** — 1inch ships SwapVM and Aqua but no indexer for either, so this is the first standardized Aqua-strategy index. The wave-specific layer (ENS `wave.following/` social follow) sits cleanly on top, not interleaved. Full assessment + the split that would make it reusable as a base subgraph: [`docs/strategy/SUBGRAPH-AQUA-REUSABILITY.md`](../../../docs/strategy/SUBGRAPH-AQUA-REUSABILITY.md).
