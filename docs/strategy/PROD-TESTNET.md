# PROD-TESTNET.md — running wave as a real product on Sepolia (no mock)

_The build plan for the **post-PR-#4** world: the 240s stage controller, `DEMO_LIVE=0`, canned `replay.json` twins, and the anvil mainnet fork are all dead. The demo runs against **live Sepolia** with real seeded strategies, real capital, real swaps, and real indexing. This doc is the concrete, current (Jul 2026) plan for each piece — what's hosted for us, what we self-host, and where the gaps are. Companion: [TECH-STACK.md](./TECH-STACK.md), [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md), [EVENT-RUNBOOK.md](./EVENT-RUNBOOK.md)._

> **Posture:** less self-hosted is better. We use first-party networks (ENS on Sepolia, The Graph decentralized network) wherever they cover our needs, and self-host only where they don't (notably: Aqua on Sepolia, and graph-node if decentralized indexing of Sepolia EVM isn't available when we need it). Every "self-host" choice below is flagged with the reason.
>
> **⚠️ This pivot is a team decision, not a doc-only ride-along.** The anvil-fork → live-Sepolia move is the **largest change in PR #4** and sits under a "remove the database" title. It needs an explicit ack from all three of us (recorded on the PR) before it's load-bearing. Two things to weigh first:
> 1. **The benefit may be smaller than assumed.** The pivot's main prize is de-risking the Graph qualification — but Graph-on-Sepolia-EVM is **UNCONFIRMED** (§2), and **both Graph tracks already name Nuthatch (self-hosted `graph-node`) as an acceptable source**. So the risk being bought out may have been modest, and the stated fallback (self-hosted `graph-node`) is what the old fork plan already used.
> 2. **Aqua self-deployment is not explicitly blessed.** The 1inch rule allows redeployment of a *modified SwapVM*; it does not name self-deploying **Aqua**. Almost certainly fine (it's their code from their repo) — but it's the **primary** bounty, so it's a 30-second question at the 1inch booth. **TODO (pre-event): confirm Aqua self-deployment is permitted.**

---

## §1 — Chain & settlement: SwapVM + Aqua + StrategyFactory on Sepolia

**Finding (verified): 1inch does NOT deploy Aqua on Sepolia.** Aqua mainnet lives at [`0x499943e74fb0ce105688beee8ef2abec5d936d31`](https://1inch.com/blog/post/aqua-developer-release) and SwapVM at `0x8fdd04dbf6111437b44bbca99c28882434e0958f`, but the supported-networks list is **mainnets only** (Ethereum, Base, Optimism, Polygon, Arbitrum, Avalanche, BNB, Linea, Sonic, Unichain, Gnosis, zkSync). No Sepolia.

**The path is documented and scripted — we deploy the stack ourselves.** The [`1inch/swap-vm-template`](https://github.com/1inch/swap-vm-template) repo ships `yarn deploy sepolia`, which runs:

1. Deploy the **Aqua protocol** (AquaRouter + Aqua itself)
2. Deploy an **AquaAMM** strategy (reference)
3. Resolve **WETH** (canonical Sepolia WETH or `WETH_ADDRESS` env)
4. Deploy **AquaSwapVMRouter**
5. (optional) Deploy **MockTaker**
6. Verify all on Etherscan

The vendored repo's own [`DEPLOY.md`](https://github.com/1inch/swap-vm/blob/main/DEPLOY.md) Makefile flow (`make deploy-swap-vm-aqua`) is the same path with `OPS_NETWORK=sepolia`, `OPS_CHAIN_ID=11155111`, `SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY`, and `OPS_AQUA_ADDRESS` set to our freshly-deployed Aqua. Its `config/constants.json` example already shows a `"11155111"` Sepolia chain-id slot.

**What we ship on top (the wave contracts, authored from scratch during the event):**
- `StrategyFactory` — deploys a strategy = ENS subname + `ship()` of capital into Aqua + writing the `v0.programhash` text record.
- The 2 custom opcodes (`_inventorySkew2D`, `_oracleGuard2D`) wired into an `AquaSwapVMRouter`-inheriting router via `_instructions()` override.

**Concrete pre-demo steps (P1 / Flaviano owns):**
1. `cd srcs/requirements/swap-vm && npm install`
2. Get SepoliaETH from a faucet (§4) into the deployer wallet.
3. Deploy Aqua → AquaSwapVMRouter → StrategyFactory on Sepolia; persist addresses to `config/constants.json` and `deployments/sepolia/`.
4. Verify on Sepolia Etherscan (the template does this automatically).

**Gap / risk:** we are now the maintainers of the Aqua deployment on Sepolia for the duration of the event. That's fine — it's a testnet, redeploy is cheap. The 1inch bounty judges see real Aqua settlement semantics; the only thing that differs from mainnet is *which chain id* and *who deployed Aqua*.

---

## §2 — Indexing: The Graph — decentralized network preferred, graph-node fallback

**Finding (verified): The Graph Hosted Service is fully deprecated (2026).** The only first-party indexing paths now are (a) the **decentralized Graph Network** via Subgraph Studio, or (b) **self-hosted `graph-node`**.

**Primary path — decentralized network:** the standard flow is [subgraph → Subgraph Studio → Publish → decentralized network](https://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/publishing-a-subgraph/). Studio handles dev/iteration; `graph publish` (CLI ≥ v0.73.0) pushes to the network; curators signal GRT to attract indexers (docs suggest ≥ ~3,000 GRT of signal for reliable indexing). **Blocker to verify at event start: is Ethereum Sepolia (chain id 11155111, EVM execution layer) indexed on the decentralized network?** The [supported-networks page](https://thegraph.com/docs/en/supported-networks/) lists only `Sepolia Beacon (sepolia-cl)` (consensus layer) in the default view; the "Show Testnets" toggle exists but its EVM-testnet coverage for Sepolia must be **confirmed live in Studio at T-0**, not assumed. If Sepolia EVM is selectable as a Subgraph Studio data source, this is our path: zero self-hosting for indexing.

**Fallback path — self-hosted `graph-node` (Docker):** if decentralized indexing of Sepolia EVM isn't available or isn't reliable enough for a live demo, we run the official [`graphprotocol/graph-node`](https://hub.docker.com/r/graphprotocol/graph-node) Docker image pointed at our Sepolia RPC. This is well-trodden: an [AWS reference](https://github.com/aws-samples/aws-graph-blockchain-indexer) explicitly indexes Sepolia (11155111), and the standard `docker-compose.yml` pattern (graph-node + Postgres + IPFS) works locally or on a single VM. graph-node's internal Postgres is **not an app database** — it's the indexer's own state store; it does not violate the "no database" rule (no app code reads or writes it).

**Recommendation:** try the decentralized network first (it's a sponsor prize we want to credibly claim and zero ops); fall back to one `graph-node` container the moment Studio can't index our Sepolia deployment. Decide at G1 (h12), not later.

**Onboarding / cost:** publishing to the decentralized network is free; curating (signaling GRT to attract indexers) costs GRT. For a hackathon we either self-signal a small amount from a team wallet or accept whatever organic indexing we get. The x402 / AI-suite sponsor perks from The Graph may offset this — check the sponsor research folder.

---

## §3 — ENS on Sepolia: live, real resolver, real `setText`

**Finding (verified): ENS is deployed on Sepolia and the Public Resolver supports arbitrary text records via `setText(bytes32 node, string key, string value)`.** Addresses ([ENS deployments page](https://docs.ens.domains/learn/deployments/)):

| Contract | Sepolia address |
|---|---|
| ENS Registry | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| Public Resolver | `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5` |
| Base Registrar | `0x57f1887a8BF19b14fc0dF6Fd9B2acc9Af147eA85` |
| ETH Registrar Controller | `0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968` |

Manage via [sepolia.app.ens.domains](https://sepolia.app.ens.domains). Gas is paid in **SepoliaETH (free via faucet, §4)**.

**The text records we write (all arbitrary keys, all supported):**
| Key | Who writes it | What it carries |
|---|---|---|
| `v0.programhash` | StrategyFactory at deploy | keccak256 of the compiled bytecode — the tamper-check root |
| `description` | strategist at compose | **the literal compiler input** (see "post is the prompt" in [frontend.md](./frontend.md)) — round-trips byte-for-byte into `/api/compile` |
| `avatar` | strategist | URL/data-URI for the card avatar |
| `wave.following/<strategy>` | the *follower*, on the follower's own name | a follow = one such record; **follower count is NOT resolvable by name enumeration** (ENS is forward-only). It's computed by indexing the resolver's `TextChanged` events in the subgraph (§2) — index all, filter `key.startsWith("wave.following/")` in the mapping (the indexed topic is a hash, can't prefix-match on-chain), count distinct emitter nodes per strategy. |

**Parent name & subname minting:** the team registers one `.eth` 2LD on Sepolia (e.g. `wave.eth`) via the ETH Registrar Controller, sets the Public Resolver on it, and `StrategyFactory` mints subnames (`eth-usdc-guarded.wave.eth`) under it using ENS subname authority. The factory owns the subname-creation path so a strategist never has to touch ENS directly for the program-hash record; the strategist's own name (where `wave.following` records live) is either their Privy-issued wallet's reverse-record or a name they bring.

---

## §4 — Wallet & auth: Privy on Sepolia, faucet-funded

**Finding (verified): Privy supports Sepolia** — it's EVM-compatible, configured via the `supportedChains` array with `sepolia` set as the `defaultChain` in the `PrivyProvider` ([Privy docs](https://docs.privy.io/basics/react/advanced/configuring-evm-networks)). Embedded wallets initialize directly on Sepolia; no network-switch UX.

**Demo-wallet funding (the whole team pre-funds before the event):**
- Each demo/seed wallet gets **SepoliaETH from a faucet**: [Google Cloud Web3 faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia), [Chainstack](https://chainstack.com/sepolia-faucet/), [Infura](https://www.infura.io/faucet/sepolia), [Alchemy](https://www.alchemy.com/) — most are rate-limited per IP/wallet per N hours, so fund early and across multiple.
- The **deployer** wallet needs enough for Aqua + router + factory deploys (~a few SepoliaETH).
- The **seed-strategy** wallets (§5) need enough to `ship()` real capital into Aqua and pay the swap gas for the demo retune beats.
- The **demo-day judge** wallet (if we hand one out) needs a small balance for a live `swap()` against a seeded strategy.

---

## §5 — The live demo flow: real seeded strategies, real swaps, real indexing

**No anvil fork. No canned twins. No `DEMO_LIVE=0`. No 240s controller.** The feed is a real product reading real chain state.

**The seed (pre-demo, owned by P3 with P1 supporting):**
1. Deploy 3–5 **real strategies** via `StrategyFactory` on Sepolia — each with a real description (the "post is the prompt"), real capital (`aqua.ship()`), a real `v0.programhash` ENS record, and a real `description` ENS record.
2. Run **real swaps** against each (as the taker) so the subgraph has `Swapped` events to index — this populates the on-card stats (volume, fills, returnPct) and gives the ranking algorithm real signal.
3. Have team wallets **follow** 2–3 of them (`wave.following/<strategy>` records) so the follow-graph term in the rank is non-zero.
4. Wait **≥1h** so the strategies clear the listing threshold (≥3 fills AND ≥1h age — see ranking in [README.md](../../README.md)).

**The demo itself (no controller — a human drives the live product):**
- Open the app → the **global feed** SSR-renders from `getFeed()` (subgraph + ENS), ranked by the algorithm. The seeded strategies are visibly ranked by returnPct, decayed by age, nudged by follows. *"Ranked by how much it's gained, decayed by age, nudged by follows."*
- Click a card → ENS hash-verify chip proves the on-chain program matches `v0.programhash` (mismatch path shown if we tamper a record on purpose).
- Compose a new strategy → the description is the compiler input → `/api/compile` → bytecode → safety card → `StrategyFactory` deploy on Sepolia → live in the feed once indexed.
- **Autonomous retune:** a real subgraph entity delta crosses threshold → the agent notices → `dock()` + recompile + `ship()` on Sepolia, autonomously. This is the beat that previously leaned on canned twins; now it's real, and the latency is whatever Sepolia + indexing gives us (see §7).

**Why this is strictly better than the fork plan:** every demo moment is a real on-chain action against a real network the judges can independently verify on Etherscan. No "trust our fork" caveat.

---

## §6 — What still needs self-hosting (minimized)

| Component | Self-host? | Why |
|---|---|---|
| **Aqua + SwapVM + StrategyFactory** | **Yes — on Sepolia itself** | 1inch doesn't deploy Aqua on Sepolia (§1). We deploy via the template's scripted flow. This is "deploying to a public chain," not "running a server." |
| **The Graph indexing** | **Only if decentralized network can't index Sepolia EVM** (§2). Fallback = one `graph-node` Docker container. | Decentralized network is preferred (sponsor prize, zero ops). Verify at G1. |
| **The Next.js app** | **Yes — one process** (a single self-hosted VM). | SSR only. The agent is a **separate container** (`AGENT_URL=http://agent:3002`) — LLM + wallet keys never live in the UI process. See [AGENT.md](./AGENT.md). |
| **ENS** | No | Live on Sepolia, first-party. |
| **Wallet/auth** | No | Privy hosted. |
| **RPC** | No (use Alchemy/Infura Sepolia RPC) | Unless rate-limited at demo time — have a backup RPC URL. |

**Net:** two self-hosted things in the worst case (Next.js app + graph-node), one in the best case (just the app). Everything else is a first-party network.

---

## §7 — Risks specific to testnet/prod (vs the old anvil-fork plan)

| Risk | Why it's new vs anvil fork | Mitigation |
|---|---|---|
| **Faucet rate limits** | anvil gave unlimited ETH from a fork; SepoliaETH is rate-capped per wallet/IP/hours. | Pre-fund all wallets (deployer + seeds + judge) **before the event**; use 3–4 faucets; keep a buffer wallet. |
| **Subgraph sync latency** | anvil indexed instantly (local node); real Sepolia indexing has a sync lag — decentralized network worse than self-hosted for a fresh subgraph. | Deploy the subgraph at G1 (h12) so it's synced by demo time; for the retune beat, fall back to a direct `eth_getLogs` poll if the subgraph lags >a few blocks. |
| **Sepolia congestion / tx latency** | anvil blocks were instant; Sepolia is a real network with real block times (~12s) and occasional congestion. | Budget ~12–60s per on-chain beat in the demo script; never demo a flow that needs sub-block confirmation. The retune tx may be *sent* early to absorb block latency — but **never built before the threshold-crossing decision exists** (see §5, autonomy boundary). |
| **🔴 Oracle HALTs on the happy path** | the T-15min fork cut *guaranteed* a fresh Chainlink `updatedAt`; live Sepolia can't (testnet feeds lag past their ~3600s heartbeat), and `_oracleGuard2D` reverts on staleness **always, in both modes**. A stale feed during the demo = a HALT where a quote should be — the core beat backwards, unrecoverable. | `maxStalenessSecs=7200` is adequate in steady state, but for **demo reliability the deployed `MockAggregatorV3` serves the happy path too** (disclosed on the slide) — the demo never depends on live-feed freshness. Real Chainlink stays wired + quoted on the safety card as the production source. |
| **Real tx failure modes** | anvil rarely reverted unexpectedly; Sepolia can (RPC desync, nonce gaps, underpriced replacements). | Use a private mempool (Alchemy/Infura `protect`) for demo txs; pre-warm nonces; have a 2nd funded wallet ready. |
| **Decentralized-network indexing not ready for our subgraph** | anvil had no "will indexers pick me up?" question. | G1 decision point (§2): if Studio can't index Sepolia EVM reliably, switch to self-hosted graph-node immediately. Don't discover this at G3. |
| **Aqua-on-Sepolia is OUR deployment** | on a fork we used 1inch's own addresses; now we own the Aqua address. | Persist it to `config/constants.json` and `deployments/sepolia/`; the SDK reads from there. Redeploy is cheap if we corrupt state. |
| **Live demo can't be reset** | anvil fork could be re-cut at T-15min; Sepolia state is permanent. | The seed (§5) must be idempotent — re-running it on a dirty chain just adds more strategies/swaps, doesn't break the demo. Don't depend on a clean slate. |

---

## Sources

- [1inch Aqua developer release — mainnet addresses](https://1inch.com/blog/post/aqua-developer-release)
- [1inch SwapVM README — supported networks (mainnets only)](https://github.com/1inch/swap-vm/blob/main/README.md)
- [1inch SwapVM DEPLOY.md — Makefile deployment, Sepolia env example](https://github.com/1inch/swap-vm/blob/main/DEPLOY.md)
- [1inch Aqua DEPLOY.md — `make deploy-aqua-router`](https://github.com/1inch/aqua/blob/main/DEPLOY.md)
- [1inch swap-vm-template — `yarn deploy sepolia` deploys full Aqua stack on Sepolia](https://github.com/1inch/swap-vm-template)
- [`@1inch/swap-vm-sdk` — AquaSwapVMRouter addresses (mainnets only)](https://cdn.jsdelivr.net/npm/@1inch/swap-vm-sdk@0.1.7/README.md)
- [The Graph — Publishing a subgraph to the decentralized network](https://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/publishing-a-subgraph/)
- [The Graph — Supported networks (Sepolia Beacon only in default view; "Show Testnets" toggle)](https://thegraph.com/docs/en/supported-networks/)
- [The Graph — graph-node (self-host reference)](https://thegraph.com/docs/en/indexing/tooling/graph-node/)
- [`graphprotocol/graph-node` Docker image](https://hub.docker.com/r/graphprotocol/graph-node)
- [AWS reference: self-hosted graph-node indexing Sepolia (11155111)](https://github.com/aws-samples/aws-graph-blockchain-indexer)
- [Chainstack 2026 — Hosted Service deprecated, decentralized network + alternatives](https://chainstack.com/top-5-hosted-subgraph-indexing-platforms-2026/)
- [ENS deployments — Sepolia addresses](https://docs.ens.domains/learn/deployments/)
- [ENS Sepolia manager app](https://sepolia.app.ens.domains)
- [ENS Text Records docs (arbitrary keys via setText)](https://docs.ens.domains/web/records/)
- [ENS Resolver interfaces (setText/getText)](https://docs.ens.domains/resolvers/interfaces)
- [Privy — Configuring EVM networks (Sepolia via supportedChains/defaultChain)](https://docs.privy.io/basics/react/advanced/configuring-evm-networks)
- SepoliaETH faucets: [Google Cloud](https://cloud.google.com/application/web3/faucet/ethereum/sepolia), [Chainstack](https://chainstack.com/sepolia-faucet/), [Infura](https://www.infura.io/faucet/sepolia), [Alchemy](https://www.alchemy.com/)
