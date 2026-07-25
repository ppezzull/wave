# wave subgraph

The Graph subgraph for **wave** — indexes the on-chain data the feed and the retune agent read. There is **no database**; `getFeed()` and `graphDelta` query this subgraph + ENS resolve, nothing else. See [`docs/spikes/GRAPH-NODE-SPIKE.md`](../docs/spikes/GRAPH-NODE-SPIKE.md) for the indexing-path decision (decentralized network vs self-hosted `graph-node` vs `eth_getLogs`).

## Status — production subgraph authored (build-green); deploy gated on Flaviano's router

**Two layers:**
- **v0.0.1 (deployed, live)** — the spike: single ENS-resolver `TextChanged` source, `textRecordChangeds` entity. Proved path A (decentralized network indexes Sepolia EVM with ~zero lag). Query: `https://api.studio.thegraph.com/query/1756983/wave/v0.0.1`.
- **v0.0.2 (authored here, build-green, NOT yet deployed)** — the production subgraph: two data sources (`EnsStrategyRouter` + ENS resolver), entities `Strategy` / `Swap` / `Follow` / `Follower`. Replaces the spike source files in this dir; deploys as the next version of the same `wave` Studio subgraph once Flaviano deploys the router on Sepolia (the manifest's router `address`/`startBlock` are placeholders until then — `graph deploy` rejects `0x0…0`).

| | |
|---|---|
| **Studio page** | https://thegraph.com/studio/subgraph/wave |
| **Query endpoint (v0.0.1, live)** | `https://api.studio.thegraph.com/query/1756983/wave/v0.0.1` |
| **Query endpoint (v0.0.2, after deploy)** | `https://api.studio.thegraph.com/query/1756983/wave/v0.0.2` |

**See also:** contract-layer gaps that block the demo (strategyId binding, committed capital, programHash) — see [`SUBGRAPH-CONTRACT-GAPS.md`](../docs/strategy/SUBGRAPH-CONTRACT-GAPS.md).

### Production entities (v0.0.2) — matches the agent client (`srcs/requirements/agent/src/clients/subgraph.ts`)

- **`Strategy`** (mutable): `id` (= orderHash), `programHash` (tolerates `bytes32(0)`), `ensNode`, `status`, ranking aggregates `cumulativeVolumeIn/Out`, `swapCount`, `lastSwapTimestamp`, `followerCount`.
  - **`cumulativeVolumeIn/Out` are `BigInt`, not `BigDecimal`** — GraphQL decimal128 caps at 34 significant figures and loses wei; the UI converts to `BigDecimal` at read time.
  - **`committedCapital` is NOT indexed** — no event emits it, so `returnPct`'s denominator is undefined until a contract change; see [`SUBGRAPH-CONTRACT-GAPS.md`](../docs/strategy/SUBGRAPH-CONTRACT-GAPS.md) C2.
  - **`programHash` is `bytes32(0)`** for every strategy until the compiler lands → the UI hash-verify chip must gate on `programHash != 0` (D3); see [`SUBGRAPH-CONTRACT-GAPS.md`](../docs/strategy/SUBGRAPH-CONTRACT-GAPS.md) C3.
- **`Swap`** (immutable): `strategy` (join key = `Swapped.orderHash`), `amountIn/Out`, `timestamp`, … The client filters `swaps(where:{strategy:$id})`.
- **`Follow`** (immutable log): one row per `wave.following/<id>` `TextChanged` event.
- **`Follower`** (mutable index): `id = node‖strategyId` — makes `followerCount` O(1) per event, reorg-exact.

**Join key:** `Strategy.id` == `StrategyDeployed.strategyId` == `Swapped.orderHash` == `SwapVM.hash(order)`.

**Ranking (`Pietro.md` 🔢):** `rank = returnPct × recencyDecay × (1 + log2(1 + followers))` — the UI computes this from `cumulativeVolume*`, `lastSwapTimestamp`, and `followerCount` exposed above. Every term is subgraph-sourced → still no database.

> **To deploy v0.0.2:** Flaviano deploys `EnsStrategyRouter` on Sepolia → set `WAVE_ROUTER_ADDRESS` + `WAVE_ROUTER_BLOCK` in `subgraph.yaml` → `graph deploy wave --studio` (label `v0.0.2`) → bump the client's `SUBGRAPH_URL` default to `…/wave/v0.0.2`.

## Build (verified green)

```bash
cd subgraph
npm install
npx graph codegen    # ✔ Types generated successfully
npx graph build      # ✔ Build completed: build/subgraph.yaml
```

## Layout

```
subgraph/
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
