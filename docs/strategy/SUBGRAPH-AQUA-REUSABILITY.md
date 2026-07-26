# Subgraph Aqua-reusability assessment (composable-upside check)

**Question (#42 optional item):** is the wave subgraph a *generic Aqua-strategy* indexer any 1inch SwapVM/Aqua app could reuse, or is it wave-coupled?

**TL;DR — the SwapVM/Aqua core is already a defensible "standardized subgraph for a category that lacks one"; the wave-specific social layer sits cleanly on top, not interleaved. 1inch ships no Aqua indexer, so this is genuinely category-novel. Splitting is a post-hackathon move; for now the assessment itself is the sponsor-pitch upside.**

Authoritative schema: [`srcs/requirements/subgraph/schema.graphql`](../../srcs/requirements/subgraph/schema.graphql); mapping: [`srcs/requirements/subgraph/src/mapping.ts`](../../srcs/requirements/subgraph/src/mapping.ts).

## What is already generic / Aqua-reusable (no change needed)

- **`Swap` entity** (`schema.graphql:59-74`) — pure SwapVM `Swapped` fields (`maker/taker/tokenIn/tokenOut/amountIn/Out/timestamp/blockNumber/transactionHash`). Any SwapVM/Aqua swap indexes identically. The most reusable piece.
- **`Strategy` aggregates + Aqua-sourced `committedCapital`** (`schema.graphql:25-57`) — `cumulativeVolumeIn/Out`, `swapCount`, `lastSwapTimestamp`, and `committedCapital` (running Aqua `Pushed − Pulled` balance). All Aqua-strategy-generic.
- **The Aqua handlers** (`mapping.ts:288-320`: `handlePushed/Pulled/Docked`) — join on `Aqua.strategyHash == SwapVM.orderHash == Strategy.id` (verified equal: `swap-vm/test/helpers/AquaSwapVMHelper.sol:357`), no wave-specific logic. Any Aqua app gets committed-capital tracking + docked-status for free.

## What is wave-coupled (three places, cleanly separable)

1. **ENS `wave.following/<id>` follow system** — the `Follow` / `Follower` / `NodeFollows` entities + `handleTextChanged` / `handleVersionChanged` (`mapping.ts:174-275`). This is wave's social-follow-on-ENS design ([`docs/tasks/Pietro.md`](../tasks/Pietro.md) §"How `followers` is actually computed"), not an Aqua concept. A pure Aqua indexer has no follower entity.
2. **`Strategy.ensNode` + `programHash`** — wave's "the post is the prompt" ENS-identity field and the compiler-bytecode-hash field. Aqua-strategies don't need either.
3. **`WAVE_FOLLOWING_PREFIX = "wave.following/"`** hardcoded in `mapping.ts:27`.

## Verdict

The coupling is a **layer on top of** the generic core, not woven through it. The base SwapVM/Aqua indexer (Strategy aggregates + Swap + Aqua capital handlers) stands on its own as "a standardized subgraph for Aqua strategies" — a category 1inch ships no indexer for. That is the real composable-upside claim for The Graph's "Standardized Subgraph for a category that lacks one" framing.

## What a split would look like (deferred — post-hackathon)

To ship it as a reusable base:
- **Base `aqua-strategy` subgraph:** `Strategy` (minus `ensNode`/`programHash`, or with them optional), `Swap`, the Aqua handlers. Parametrize the router address + the `Swapped`/`StrategyDeployed` ABIs.
- **`wave-ens-social` overlay:** `Follow`/`Follower`/`NodeFollows` + the TextChanged/VersionChanged handlers, parametrized on the follow-key prefix.

This is schema discipline, not hours — but it is **not cheap mid-hackathon** (two subgraphs, two deploys, reworked manifest). The handoff scopes this item as optional; **do not refactor now.** Record the upside and pitch it.

## Pitch line (for the demo / submission prose)

> "1inch ships SwapVM and Aqua but no indexer for either. wave's subgraph is the first standardized Aqua-strategy index — `Swap`, per-strategy volume aggregates, and Aqua-sourced committed capital, joinable on `strategyHash == orderHash`. We layer an ENS-based social-follow graph on top; the Aqua core is reusable by any SwapVM app."
