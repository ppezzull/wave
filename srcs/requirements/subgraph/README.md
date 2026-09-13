# wave subgraph

The Graph subgraph for **wave** — indexes the on-chain data the feed, the profiles and the retune agent read. There is **no database**; `getFeed()`, `graphDelta`, profiles and threads query this subgraph, nothing else.

## Status (ETHOnline, 11 Sep 2026)

| | |
|---|---|
| **Studio page** | https://thegraph.com/studio/subgraph/wave |
| **Live (serving)** | **v0.0.5** — `https://api.studio.thegraph.com/query/1756983/wave/v0.0.5` |
| **Pending live** | **v0.0.6** — adds `Strategy.author` + the `StrategyFactory` data source (schema/mapping committed; deploys with the live router+factory redeploy — see [`docs/DEPLOY-LIVE-TESTNET.md`](../../../docs/DEPLOY-LIVE-TESTNET.md)) |
| **Local dev** | full graph-node stack (anvil fork + rpc-shim + compose) — see the repo memory/runbook; `pnpm deploy:local` |

Version history: v0.0.1 (ENS-resolver spike, superseded) → v0.0.2 (router + resolver) → v0.0.4 (Aqua capital) → v0.0.5 (descriptions, follows removed) → **v0.0.6 (authorship)**. The ENS resolver data source and the `Follow`/`Follower` entities were **removed at continuity** (`f441287`) — the follow graph no longer exists; ranking no longer has a follower term.

## Data sources (v0.0.6 shape)

| Contract | Events | Role |
|---|---|---|
| `EnsStrategyRouter` | `StrategyDeployed`, `StrategyDescribed`, `Swapped` | the ONLY row creator; the post (description) lives on-chain; swap aggregates |
| `Aqua` | `Pushed`, `Pulled`, `Docked` | committed capital (running balance) + stopped status |
| `StrategyFactory` | `StrategyAttributed` | **on-chain authorship** → `Strategy.author` |

## Entities

- **`Strategy`** (mutable): `id`, `programHash`, `status`, `description`, **`author`** (`0x00…0` sentinel until attributed — filterable `where:{author:$addr}`, the profile/thread key), `cumulativeVolumeIn/Out` (**BigInt**, never decimal128 — wei-exact), `committedCapital`, `swapCount`, `lastSwapTimestamp`.
- **`Swap`** (immutable): `strategy` join key, amounts, timestamp, tx hash. `swaps(where:{strategy:$id})`.

**Join key (the load-bearing invariant):** `Strategy.id` == `StrategyDeployed.strategyId` == `Swapped.orderHash` == Aqua's `strategyHash` == `keccak(wrapped abi.encode(order))` == `SwapVM.hash(order)`. ONE id everywhere — the agent's ship pipeline pins it (`deployStrategy.ts`); a differently-encoded ship docks under an unreachable hash and the capital never indexes (fork-proven).

**No phantom rows (F2):** `handlePushed`/`handleSwapped`/`handleStrategyAttributed` all `Strategy.load(); if null return` — an event for an unknown strategy is ignored, never creates a row. This is why announce MUST precede ship.

## Layout

```
srcs/requirements/subgraph/
├── schema.graphql            # Strategy (author!) + Swap
├── subgraph.yaml             # LIVE manifest (router + Aqua + factory datasources)
├── subgraph.local.yaml       # local fork manifest (fresh addresses + startBlocks)
├── src/mapping.ts            # handle{StrategyDeployed,StrategyDescribed,Swapped,Pushed,Pulled,Docked,StrategyAttributed}
├── abis/                     # router + Aqua + StrategyFactory fragments
├── test/local-invariants.mjs # pnpm test:local — real assertions against the RUNNING graph-node
└── package.json              # pnpm; graph-cli/graph-ts (allowBuilds for native deps)
```

## Build & deploy

```bash
pnpm install
pnpm codegen && pnpm build

# local (needs the anvil-fork + graph-node stack up)
pnpm create-local && pnpm deploy:local --version-label local<N>

# studio (needs `graph auth --studio <key>` once)
pnpm deploy:studio --version-label v0.0.6
```

⚠️ Local-stack gotcha: graph-node behind the **rpc-shim** (anvil answers EIP-1898 object params with a hashless block that stalls the ingestor) — the shim at `:8547` is mandatory between graph-node and anvil.

## Tests

`pnpm test:local` runs `test/local-invariants.mjs` against the running gateway: every `author` is the sentinel or a valid address, `committedCapital` integrality, swaps join existing strategies, and (with `WAVE_TEST_AUTHOR=0x…`) the author-keyed path the profiles depend on. Structural by design — it pins the mapping's promises on real indexed blocks, not fixtures.

## Composable upside — a standardized Aqua-strategy index

The SwapVM/Aqua core (`Swap`, per-strategy volume aggregates, Aqua-sourced `committedCapital`, on-chain authorship) is **generic** — 1inch ships SwapVM and Aqua but no indexer for either, so this is a first standardized Aqua-strategy index. Full assessment: [`docs/strategy/SUBGRAPH-AQUA-REUSABILITY.md`](../../../docs/strategy/SUBGRAPH-AQUA-REUSABILITY.md).
