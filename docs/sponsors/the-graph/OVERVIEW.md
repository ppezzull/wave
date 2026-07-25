# The Graph 🔴 P0

## Prizes — $15,000 across four tracks

> ⚠️ Use the per-track listings, not the summary paragraph at the top of the bounty page. That paragraph says "three tracks" and quotes different splits ($3k/$2k/$2k for AI Tooling, $2.5k/$1.5k/$1k for the others) — it sums to $17k and contradicts the listings. The four listings below sum to exactly $15,000.

- **Best AI Tooling — $5,000** ($2.5k/$1.5k/$1k). Reusable infra (MCP servers, SKILLs, x402 tooling, client configs). Explicitly **"not a single end-user app"** → Wave does not qualify, and per Kill List §6 we are **not** extracting a SKILL/MCP to chase it (wrapper smell, and it competes for the retune hours). Auto-entered, not winnable. Judged: usefulness to builders 30%, reusability 25%, Graph usage 20%, execution 15%, innovation 10%.
- **Best AI Use Case — $3,000** ($2k/$1k) ← **our target**. Agent/app using The Graph as *load-bearing live data source*. Judged: effective Graph use 35%, usefulness 25%, execution 20%, innovation 10%, demo 10%. _(The track offers bonus credit for also shipping a reusable SKILL/MCP — **we are declining it**, see line above.)_
- **Best Composable/Standardized — $3,000** ($2k/$1k) — see the case below. Judged: leverage of composability/standards 35%, breadth 20%, execution 20%, usefulness 15%, demo 10%.
- _Best AI Use Case (Continuity) — $4,000 ($2k/$1k/$1k) — **not ours** (Continuity Track only; we are Classic/from-scratch)._

**Composable: one of the two paths is reachable, the other is not.** The qualification reads "**Either** compose two or more of The Graph's products, **or** build meaningfully on a standardized schema (e.g. Messari…)":

1. _Compose two products_ — **weak, do not plan around it.** "Subgraph + MCP + x402" is one product accessed three ways, not two composed products; the listed examples are far heavier (a layered MCP comparing lending/DEX/derivatives, a pipeline composing `.spkg` packages into a new sink). The page states outright: "simply querying one Subgraph with no composition or standardization does not qualify."
2. _Standardized schema_ — "**Authoring/extending a Standardized Subgraph… is in scope**", example: "**A new Standardized Subgraph for a protocol category that lacks one.**" Aqua is exactly such a category (1inch ships no indexer). Cost = **schema discipline, not new code**: author our subgraph as a generic *Aqua strategy* schema any Aqua app could reuse, not one coupled to our internal structs.

Weak spot either way is **Breadth (20%)** — one protocol. Treat as an upside, not a plan; do not reallocate hours.

Hard rules — **every track**: live data from a Graph provider (mocked/static disqualifies); public repo; 2–4 min demo video.
Track-specific: AI Use Case + Continuity also require an agent that *reasons over or acts on* the data (not raw query output), a short description of which subgraphs/endpoints/tools are used, and that the project be built during the event. AI Tooling additionally requires open-sourcing with a clear README or SKILL.md.

⚠️ **Open qualification risk:** AI Use Case requires "live data from a Graph provider" and names Nuthatch (self-hosted) as acceptable, but our plan runs a **local graph-node against an anvil fork**. Cheapest mitigation: also publish the subgraph to **Subgraph Studio** so the submission carries a Studio link, while the demo runs locally (you cannot fork-index from Studio). This is the "Studio insurance" decision point already on Pietro's sheet — **greenlight only if G2 landed on time**, per [../../tasks/Pietro.md](../../tasks/Pietro.md).

## Ground truth

- **Subgraph MCP**: MCP server connecting models to subgraphs on The Graph Network — explore schemas, execute GraphQL, **discover subgraphs by keyword or contract address** (with 30-day usage data), get real-time data. Connects to Claude/Cline/Cursor. Auth/endpoint details not in the overview doc → find in setup docs.
- **Substreams MCP**: `search_substreams`, `inspect_package`, `list_package_modules`, `get_sink_config`.
- **Agent Skills**: knowledge packs for subgraph/substreams development, available as Claude Code plugins.
- **x402 pay-per-query: no API key needed** — flow: query x402 endpoint → gateway returns payment requirements → client signs + resubmits → results. Endpoints: mainnet `https://gateway.thegraph.com/api/x402/subgraphs/id/{subgraph_id}` (Base USDC) · testnet `https://testnet.gateway.thegraph.com/api/x402/subgraphs/id/{id}` (Base Sepolia USDC `0x036C…CF7e`). Package `@graphprotocol/client-x402`, wallet key via `X402_PRIVATE_KEY`. _Reference only — **x402 is Pietro's first scope cut**, see "Our plan" below._
- **Standardized Subgraphs:** Messari-maintained shared schemas — DEX AMM, DEX AMM Extended (concentrated liquidity), Lending, Yield, NFT Marketplace, Derivatives, Bridge, Network + Generic base. Common backbone (Token/Protocol/snapshots) ⇒ one query pattern across protocols; deployment IDs in the Messari GitHub repo. _Reference only — **we do not consume Messari data** (Kill List §6). Relevant solely as the shape to imitate if we pursue the Composable upside._

## Our plan — read this before the schema (⚠️ superseded an earlier plan)

**We index our own events. We do not consume third-party market data.**

The subgraph is **first-party**: it indexes the `Swapped` and `StrategyDeployed` events emitted by our own `EnsStrategyRouter` on the fork. Schema, mapping and liveness are all ours.

**Why this shape, so nobody re-opens it at 3am:**

1. **The retune must be *caused* by the judge's swap.** Beat C is: judge swaps → `Swapped` indexed → `cumulativeVolume` ticks → threshold crossed → `dock()`+recompile+`ship()`, zero clicks. Mainnet volatility from a public subgraph does not move when the judge swaps on a fork, so it can decorate a decision but can never *trigger* one.
2. **It kills the Messari-sync risk** — no dependency on someone else's schema staying deployed and in sync for our fork's chain (Kill List §6).
3. **It kills the "mocked data" smell** — the entities are real events from a real router, produced live on stage.
4. **It is the bridge to 1inch.** Aqua deletes the pool, which deletes where takers find liquidity; asked directly for an indexer, 1inch answered "we don't provide one, use The Graph" (workshop Q&A 16:44). Our subgraph is that missing layer — see [../1inch/HOW-IT-WORKS.md](../1inch/HOW-IT-WORKS.md) §0.6.

**The qualification bar this clears:** "an AI/agent component that reasons over or acts on the data, not just prints a raw query result" — the agent reads a real entity delta and acts by reshipping the strategy. The 9→10 miss to avoid: a **time-triggered** retune with Graph data merely displayed.

**Schema discipline (cheap, keeps the Composable upside alive):** write it as a generic *Aqua strategy* schema any Aqua app could reuse — Strategy (id, programHash, ensNode, maker, tokens) + Swap (amounts, `cumulativeVolume` rollup) — not one coupled to our test structs. Zero extra hours; it only changes how the entities are named and shaped.

**Not in scope** (all Kill List §6): consuming Messari schemas · a standalone SKILL/MCP for the Tooling track · multi-subgraph composability. **x402 is Pietro's declared first scope cut** — post-G2 only, with an env-var Studio-key fallback.

## Open questions

- [ ] **Studio insurance** — does a local graph-node satisfy "live data from a Graph provider"? Mitigation and the greenlight condition are in the ⚠️ box above
- [ ] graph-node against anvil: instant-mine vs block polling, fork-reset reorgs, `eth_getLogs` ranges — Pietro's h2–4 verdict decides whether the `eth_getLogs` fallback gets armed
- [ ] Subgraph re-sync time must fit inside the T-15min fork-recut window (measured during the G3 dry runs)
- [ ] Subgraphs are **AssemblyScript** (a TypeScript subset), not TypeScript — confirm the mapping toolchain before h16. There is also an official subgraph SKILL for the IDE; *using* their tooling is fine, only *shipping* one is out

## Links

- AI overview: https://thegraph.com/docs/en/ai-overview/ · Studio (API keys): https://thegraph.com/studio/
- Explorer: https://thegraph.com/explorer · x402: https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/
- Substreams skills: https://github.com/streamingfast/substreams-skills · Messari standardized subgraphs: https://github.com/messari/subgraphs
