# The Graph 🔴 P0

## Prizes ($15k total across three tracks)

- **Best AI Tooling — $7,000** ($3k/$2k/$2k; note 3rd = $2k). Reusable infra (MCP servers, SKILLs, x402 tooling). Judged on usefulness to builders 30%, reusability 25%, Graph usage 20%.
- **Best AI Use Case — $4,000** ($2k/$1k/$1k) ← our target — agent/app using The Graph as *load-bearing live data source*. Judged: effective Graph use 35%, usefulness 25%, execution 20%, innovation 10%, demo 10%. **Bonus credit for also shipping a reusable SKILL or MCP server.**
- **Best Composable/Standardized — $4,000** ($2k/$1k/$1k) — Standardized Subgraphs (shared schemas), composed Substreams packages.

Hard rules (all tracks): **live data from a Graph provider — mocked/static disqualifies**; public repo; 2–4 min video; agent must reason over data, not print query results.

## Ground truth

- **Subgraph MCP**: MCP server connecting models to subgraphs on The Graph Network — explore schemas, execute GraphQL, **discover subgraphs by keyword or contract address** (with 30-day usage data), get real-time data. Connects to Claude/Cline/Cursor. Auth/endpoint details not in the overview doc → find in setup docs.
- **Substreams MCP**: `search_substreams`, `inspect_package`, `list_package_modules`, `get_sink_config`.
- **Agent Skills**: knowledge packs for subgraph/substreams development, available as Claude Code plugins.
- **x402 pay-per-query: no API key needed** — flow: query x402 endpoint → gateway returns payment requirements → client signs + resubmits → results. Endpoints: mainnet `https://gateway.thegraph.com/api/x402/subgraphs/id/{subgraph_id}` (Base USDC) · testnet `https://testnet.gateway.thegraph.com/api/x402/subgraphs/id/{id}` (Base Sepolia USDC `0x036C…CF7e`). Package `@graphprotocol/client-x402`, wallet key via `X402_PRIVATE_KEY`. Docs explicitly: "well suited to autonomous agents… that can't store long-term credentials." ⭐ The agent paying per query = stronger "effective use of The Graph" story than a static API key, and it's demo-visible.
- **Standardized Subgraphs:** Messari-maintained shared schemas — **DEX AMM v1.3.2 + DEX AMM Extended v4.0.1 (concentrated liquidity!)**, Lending v3.1.0, Yield v1.3.1, NFT Marketplace, Derivatives, Bridge, Network + Generic base. Common backbone (Token/Protocol/snapshots) ⇒ one query pattern across protocols. Deployment IDs live in the Messari GitHub repo. ⭐ DEX AMM Extended is the pool/volatility data source — and querying a *standardized* schema strengthens the Graph judging story.

## Our plan

- The agent uses Subgraph MCP (or direct GraphQL w/ Studio API key) to pull pool state, volume, volatility for the target pair → feeds strategy-block parameterization → this is the "reasons over data" requirement.
- Cheap bonus: package the Graph integration as a small reusable SKILL/MCP tool ("LP market-conditions tool") → bonus credit.

## Open questions

- [ ] Subgraph MCP endpoint + auth (overview doc omits them — check setup docs / Studio); still get a Studio API key as x402 fallback
- [ ] Pick exact Messari DEX AMM Extended deployment(s) for the fork target chain; verify volatility-derivable fields (swap volume snapshots, tick data?)
- [ ] Fund a Base (or Base Sepolia) wallet with USDC for x402 demo; measure per-query cost
- [ ] Rate limits / free query allowance during hackathon

## Links

- AI overview: https://thegraph.com/docs/en/ai-overview/ · Studio (API keys): https://thegraph.com/studio/
- Explorer: https://thegraph.com/explorer · x402: https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/
- Substreams skills: https://github.com/streamingfast/substreams-skills · Messari standardized subgraphs: https://github.com/messari/subgraphs
