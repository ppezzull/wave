# wave

> **A social market for natural-language on-chain strategies, built on 1inch SwapVM.**

[![Solidity](https://img.shields.io/badge/Solidity-0.8.30-363636)](https://soliditylang.org/) [![Foundry](https://img.shields.io/badge/Foundry-SwapVM-5C4EC2)](https://book.getfoundry.sh/) [![1inch](https://img.shields.io/badge/1inch-Aqua-079FE0)](https://1inch.ai/) [![The Graph](https://img.shields.io/badge/The_Graph-subgraph-00D4C6)](https://thegraph.com/) [![ENS](https://img.shields.io/badge/ENS-identity-5298E0)](https://ens.domains/) [![Mastra](https://img.shields.io/badge/Mastra-agent-6D28D9)](https://mastra.ai/) [![z.ai](https://img.shields.io/badge/z.ai-LLM-1E88E5)](https://z.ai/) [![Next.js](https://img.shields.io/badge/Next.js-SSR-000000)](https://nextjs.org/) [![Privy](https://img.shields.io/badge/Privy-auth-5B8DEF)](https://www.privy.io/) [![Sepolia](https://img.shields.io/badge/Network-Sepolia-7B3FE4)](https://sepolia.dev/)

**Built for [ETHGlobal Lisboa 2026](https://ethglobal.com/events/lisbon2026) (Classic "from scratch" track).**

---

## Project Vision

### Overview

1inch built a **VM for swap orders** — where a market-making strategy is a bytecode *program*, not a deployed contract — but shipped **no compiler**. wave ships the compiler *and a social feed around it*: tell it your strategy in a sentence, and it ships a safety-checked market maker live on-chain, then posts it to a public feed where anyone can discover, follow, and trade against it.

A strategist types plain intent; the LLM only parses it into a bounded, schema-validated form; a **deterministic compiler** turns that into verified SwapVM bytecode that settles live on **Aqua on Sepolia**. The shipped strategy gets a public description — which is also the **literal compiler input** — and appears in an **X-style feed** ranked by a real algorithm. Takers discover it via **ENS** and verify the on-chain program matches its recorded hash before settling.

**There is no database.** Every field on a feed card comes from The Graph subgraph or from ENS text records.

### Core Innovation

**Likes are liquidity.** The signal that a strategy is good is said by someone who put capital behind it, not by a thumb. The three social verbs are remapped onto on-chain reality:

- **Like** becomes the capital already on the card — committed volume and fills, read from the subgraph.
- **Follow** becomes a `wave.following` text record on the follower's own ENS name — the follow graph lives on-chain.
- **Comment** maps to nothing on-chain, so it is cut.

The thesis, in one line: *likes are liquidity, the feed is The Graph, profiles are ENS.* See [PROOF-OF-CAPITAL.md](./docs/strategy/PROOF-OF-CAPITAL.md).

---

## Technical Architecture

wave runs as a vertical pipeline (read it as 7 OSI layers). The strategist types at the top; everything below is deterministic and settles on Sepolia.

```mermaid
graph TB
    L7["L7 · PRESENTATION — Next.js SSR · X-style feed · safety card · Privy auth · no database"]
    L6["L6 · AGENTIC — Mastra + z.ai + custom MCP (own container) · NL intent to bounded form · autonomous retune"]
    L5["L5 · COMPILATION — deterministic TS compiler · Zod to AST to IR to bytecode · reject-and-rewrite"]
    L4["L4 · EXECUTION — SwapVM bytecode · verified program op-len-args · custom opcodes: _inventorySkew2D, _oracleGuard2D"]
    L3["L3 · SETTLEMENT — 1inch Aqua on Sepolia · live order · liquidity stays in-wallet · pull/push"]
    L2["L2 · DATA — The Graph subgraph · indexes Swapped · retune signal + on-card stats"]
    L1["L1 · IDENTITY — ENS · subname + v0.programhash + wave.following records · tamper-checked"]

    L7 --> L6
    L6 --> L5
    L5 --> L4
    L4 --> L3
    L2 -. "entity delta + stats" .-> L6
    L6 -. "dock · recompile · ship" .-> L3
    L3 -. "program hash" .-> L1
    L1 -. "verify before settle" .-> L3
```

| Layer | Role | Tech | Guarantee |
|---|---|---|---|
| **L7** Presentation | social UI + safety card | Next.js (App Router, SSR), Privy | discover, follow, trade-against |
| **L6** Agentic | parse intent + autonomous retune | Mastra + z.ai + custom MCP (own container) | LLM only fills a bounded form — writes no code; retune is zero-click, driven by subgraph deltas |
| **L5** Compilation | deterministic middle | TypeScript (Zod to AST to IR to bytecode) | safe bytecode or a visible reject + corrected diff |
| **L4** Execution | run the program | SwapVM + 2 custom opcodes | `quote()` equals `swap()`, by VM design |
| **L3** Settlement | live order | 1inch Aqua on Sepolia | custody never leaves the maker wallet |
| **L2** Data | retune signal | The Graph subgraph (decentralized network; graph-node fallback) | on-chain truth, pure event-indexing |
| **L1** Identity | trust root | ENS subnames + `v0.programhash` + `wave.following` | the on-chain program matches its recorded hash; follows are on-chain records |

---

## Smart Contract Architecture

### The seven-step flow

```mermaid
flowchart LR
    intent["NL intent\n(possibly unsafe)"] --> parse["bounded form\n(Zod)"]
    parse --> gates{"safety gates\n6 typed rules"}
    gates -->|"pass"| canon["canonical order\nAST to IR"]
    gates -->|"fail"| reject["reject +\ncorrected diff"]
    canon --> bc["verified bytecode\nop-len-args"]
    reject --> bc
    bc --> aqua["Aqua order\nL3"]
```

1. **Parse intent** — strategist types *"keep ETH/USDC balanced, halt if Chainlink deviates 1.5%."*
2. **Bound it** — the z.ai LLM fills a schema-validated form; it writes no code.
3. **Compile** — a deterministic TS pipeline (Zod to AST to IR to bytecode) with a reject-and-rewrite pass.
4. **Verify** — `quote()` simulates the program; the safety card goes green or red.
5. **Ship** — deploy the live Aqua order on Sepolia; liquidity stays in the maker wallet.
6. **Index** — a The Graph subgraph (decentralized network preferred, self-hosted graph-node fallback) emits deltas that drive the autonomous retune.
7. **Settle** — taker resolves the ENS name, checks the program hash, then settles on Sepolia.

### Why a compiler, not a template picker

A template picker can only emit one of N fixed strategies. A compiler composes typed blocks into any *valid* permutation, and visibly refuses the unsafe ones.

1. **Deterministic assembly** — enforces a canonical, security-critical instruction order (wrong order = wrong settlement math).
2. **It rejects unsafe programs** — type a malicious intent and it visibly refuses, then emits the corrected bytecode with a diff. A template cannot do that.
3. **It composes** — a few typed blocks generate any valid permutation, not N fixed templates.

The canonical order enforced by the compiler: `deadline to concentration to decay to oracleGuard to inventorySkew to makerFee to protocolFee to curve to salt`. Rejection rules: `OracleGuardMustPrecedeSkew`, `ProtocolFeeLeMakerFee`, `SaltMustBeTerminal`, `OracleStalenessRequiresGuard`, `FeeAfterCurve`, `NoDuplicateDeadline`.

### The retune loop — autonomous, zero-click, data-caused

The agent turns a `Swapped` event into an adapted position. When the subgraph reports an entity delta, a pure-function policy decides what to do. Retune is **always autonomous** — it is the load-bearing invariant for The Graph track, because the retune must be caused by live data, not a timer or a button. Human-in-the-loop gates only stop, remove, and genuine escalations; the HITL set and the retune set are disjoint.

```mermaid
flowchart TD
    delta["subgraph entity delta"] --> decide{"policy.decide()\nfirst match wins"}
    decide -->|"oracle dead / chronic underfund"| stop["stopStrategy (HITL)"]
    decide -->|"grace expired"| remove["removeStrategy (HITL)"]
    decide -->|"conflict / unknown signal"| ask["askHuman (HITL)"]
    decide -->|"return floor + retune trigger"| retune["retune (autonomous)"]
    decide -->|"R1-R4: volume / skew / band-edge / return decay"| retune
    decide -->|"otherwise"| noop["NOOP"]
    retune --> loop["dock to recompile to ship\nevidence log cites the entity ID"]
```

Full spec, triggers, and the `decide()` precedence tree: [AGENT.md](./docs/strategy/AGENT.md).

---

## We extended the VM (L4)

Two new first-class instructions, each proven against SwapVM's seven documented invariants:

| Opcode | What it does |
|---|---|
| **`_inventorySkew2D`** | keeps maker inventory near a target ratio via a deviation-weighted penalty |
| **`_oracleGuard2D`** | maker-protection circuit breaker — reverts or clamps on oracle deviation, **always reverts on staleness** (the demo's judge-triggered halt) |

These are trust-free VM instructions, not `_extruction` external calls (which 1inch's own code warns takers must validate, since they can silently break quote/swap consistency).

---

## Bounties Implementation

Prize picks (3 selections, the maximum): **1inch + The Graph + ENS**. See [IDEAS.md](./docs/strategy/IDEAS.md).

| Sponsor | Priority | Why |
|---|---|---|
| [1inch](./docs/sponsors/1inch/OVERVIEW.md) | P0 | Chosen core — SwapVM/Aqua. Custom-opcode recipe in [SWAPVM-INTERNALS.md](./docs/sponsors/1inch/SWAPVM-INTERNALS.md) |
| [The Graph](./docs/sponsors/the-graph/OVERVIEW.md) | P0 | Chosen data layer — subgraph indexing `Swapped` drives the live retune signal |
| [ENS](./docs/sponsors/ens/OVERVIEW.md) | P0 | Chosen identity layer — subnames + `v0.programhash` (tamper-check) + `wave.following` (follow graph) |

### 1inch — SwapVM + Aqua

The core VM and settlement layer, extended with 2 custom opcodes, settling live on Sepolia. 1inch ships Aqua on mainnets only, so the Aqua stack is self-deployed on Sepolia via the swap-vm-template flow — see [PROD-TESTNET.md](./docs/strategy/PROD-TESTNET.md).

### The Graph — the feed is the subgraph

A subgraph indexes `Swapped` and the ENS resolver's `TextChanged` events. Every card field that is not on ENS comes from here — swaps, hashes, volume, fills, and the retune signal. Deployed to the **decentralized network** (preferred over self-hosted `graph-node`); `eth_getLogs` polling is a labelled fallback while the subgraph syncs.

### ENS — profiles are ENS names

Sepolia deployment. Subnames carry a `v0.programhash` text record takers verify before settling (a tamper-check, not cosmetic), plus `wave.following/<strategy>` records (the follow graph) and a `description` record (the literal compiler input).

---

## Tech Stack

- **Solidity 0.8.30** / Foundry — SwapVM (forked 1inch, release/1.1) + 2 custom opcodes + `StrategyFactory`, deployed on **Sepolia**.
- **1inch Aqua** — settlement on Sepolia; `ship()` / `dock()` / `pull()` / `push()` (custody stays in the maker wallet).
- **TypeScript** — deterministic compiler (Zod to AST to IR to bytecode) + agent (viem, `@1inch/aqua-sdk`).
- **Next.js** (App Router, SSR) + React — split-screen UI + safety card; `getFeed()` SSR from subgraph + ENS; `/api/compile` + `/api/stream` route handlers.
- **The Graph** — subgraph (AssemblyScript mapping, GraphQL) on the decentralized network, with self-hosted `graph-node` fallback.
- **ENS** — Sepolia deployment; subnames + `v0.programhash` + `wave.following` + `description` text records.
- **Mastra** + **z.ai** + a **custom MCP server** — the agent runs in its own container; intent parsing plus the autonomous retune loop, driven by subgraph deltas. See [AGENT.md](./docs/strategy/AGENT.md).
- **Privy** — wallet auth on Sepolia (id = ENS name or `0x...`).

---

## Features

- **Natural-language strategies** — type a sentence, get a verified SwapVM program.
- **It's a compiler, not a template picker** — composes typed blocks into any valid permutation, not N fixed templates.
- **Reject-and-rewrite safety gate** — a malicious intent (e.g. oracle guard after the skew) is visibly refused, then corrected with a side-by-side diff.
- **`quote()` equals `swap()` by design** — the safety check is native to the VM, not bolted on.
- **Two new VM opcodes** — `_inventorySkew2D` (inventory rebalance) + `_oracleGuard2D` (maker-protection circuit breaker).
- **A real social ranking, not a like count** — the feed is ranked by `rank = returnPct * recencyDecay * (1 + log2(1 + followers))`: the card's return % (PnL divided by committed capital, from the subgraph), decayed by age (24h half-life), nudged by follows (count of ENS `wave.following` records). Listed (3+ fills, 1h+ age); else shown unranked. *Stage line: "ranked by how much it's gained, decayed by age, nudged by follows."* Every term comes from chain or ENS — still no DB.
- **X-style social feed** — public descriptions (the literal compiler input), an ENS follow graph, trade-against. *Likes are capital* — the card already shows committed volume and fills.
- **ENS tamper-check** — every card proves the on-chain program matches its recorded hash.

---

## Getting Started

All Foundry/contract commands run **from `srcs/requirements/swap-vm/`**, not the repo root. Dependencies are npm-managed (not git submodules) — install with `npm install` (or `yarn`).

### Prerequisites

- **Node.js** 18+
- **Foundry**, for smart-contract development
- **Docker**, to run the multi-component stack

### Quick start

```bash
# Clone the repository
git clone https://github.com/ppezzull/wave.git
cd wave

# Contracts (Solidity / Foundry)
cd srcs/requirements/swap-vm
npm install
forge build
forge test -vvv --gas-report

# Full stack (compiler, ui, subgraph, agent) once components land
cd ../..
cd srcs && docker compose up --build
```

---

## Repo Layout

| Path | What's there |
|---|---|
| `docs/` | all documentation (sponsors, strategy, review, swap-vm-upstream) |
| `docs/strategy/` | the build docs — one job each (playbook, pitch, tech-stack, runbook) |
| `docs/tasks/` | the execution layer — shared plan + per-person build sheets |
| `docs/sponsors/` | one directory per sponsor; `OVERVIEW.md` = distilled knowledge |
| `srcs/requirements/swap-vm/` | Solidity/Foundry — SwapVM fork + custom opcodes |
| `srcs/requirements/{compiler,ui,subgraph,agent}/` | build components (land during the event) |
| `srcs/docker-compose.yml` | orchestration (one folder per component) |
| `docs/swap-vm-upstream/` | vendored 1inch upstream docs (`LicenseRef-Degensoft-SwapVM-1.1`) |
| `CLAUDE.md` | project guide for Claude Code |

---

## Documentation

### Strategy docs (`docs/strategy/`) — one job each

| Doc | Job |
|---|---|
| [PROOF-OF-CAPITAL.md](./docs/strategy/PROOF-OF-CAPITAL.md) | **THE THESIS** — *likes are liquidity, the feed is The Graph, profiles are ENS.* Read first |
| [10-10-PLAYBOOK.md](./docs/strategy/10-10-PLAYBOOK.md) | **THE BUILD PLAN** — finalist reframe, opcode/compiler spec, 5 moves, 36h Gantt, 10/10 scorecard |
| [AGENT.md](./docs/strategy/AGENT.md) | **THE AGENT SPEC** — Mastra + z.ai + custom MCP, HITL posture, retune/stop policy |
| [frontend.md](./docs/strategy/frontend.md) | **THE UI SPEC** — pages, routes, panes, data flow, demo beats, failure tree |
| [PITCH.md](./docs/strategy/PITCH.md) | the demo — 3-act narrative, killer facts, Q&A armor, sponsor judge lenses |
| [EVENT-RUNBOOK.md](./docs/strategy/EVENT-RUNBOOK.md) | the 36h ops — gates, cut order, demo failure tree, submission checklist |
| [TECH-STACK.md](./docs/strategy/TECH-STACK.md) | the stack — Solidity/Foundry + TS compiler + Next.js SSR + Graph subgraph + ENS |
| [PROD-TESTNET.md](./docs/strategy/PROD-TESTNET.md) | running wave as a real product on Sepolia — no mock, no fork |
| [IDEAS.md](./docs/strategy/IDEAS.md) | why this idea (and the fallback, and why-not-Uniswap) |

### Build tasks (`docs/tasks/`) — the execution layer

| Doc | Job |
|---|---|
| [tasks.md](./docs/tasks/tasks.md) | **INDEX** — board at a glance, reading order, working agreement |
| [Plan.md](./docs/tasks/Plan.md) | **shared backbone** — checkpoints (G1/G2/G3), parallel timeline, handoff contract |
| [Flaviano.md](./docs/tasks/Flaviano.md) | P1 — 1inch/Solidity (opcodes, invariant/mutation tests, fork, `graph deploy`) |
| [Flavio.md](./docs/tasks/Flavio.md) | P2 — Compiler + ENS (emit, reject-and-rewrite, hash-verify) |
| [Pietro.md](./docs/tasks/Pietro.md) | P3 — Graph + Social UI + demo + all submission prose |

---

## Roadmap

### Current scope (ETHGlobal Lisboa 2026)

- SwapVM fork building, with the dropped upstream test base restored.
- 2 custom opcodes specified against the seven invariants; oracle-guard band decided (one-sided, maker-unfavourable only).
- Deterministic compiler skeleton + canonical ordering + reject-and-rewrite rules.
- No-database architecture: feed reads from the subgraph + ENS only.
- Agent spec locked: Mastra + z.ai + custom MCP, autonomous retune, HITL gates on stop/remove only.

### During the event

- Clean rewrite of `_inventorySkew2D` + `_oracleGuard2D` (per spec, not spike); invariant + mutation tests.
- Live Aqua swap through a stock program on Sepolia (the 1inch bounty qualification moment).
- Subgraph authored and deployed to the decentralized network on Sepolia.
- Zero-click retune end-to-end: subgraph delta to `recompileAndShip()`, evidence log citing the entity ID.
- Next.js feed + compose split-screen + ENS tamper-check pane.

### Long-term vision

- A general-purpose marketplace where any market-making strategy is composable, verifiable, and socially discoverable — with reputation anchored to on-chain capital, not engagement metrics.

---

## Contributors

Built by a 3-dev team for ETHGlobal Lisboa 2026, Classic "from scratch" track.

- [ppezzull](https://github.com/ppezzull/) — on-chain / SwapVM / deploy
- [fcarlucc](https://github.com/fcarlucc/) — on-chain / SwapVM / opcodes
- Flavio — compiler + ENS + agent

---

**Event:** ETHGlobal Lisboa — build starts Fri Jul 24, 2026 — submission Sun Jul 26, 09:00 WEST (~36h).
**Goal:** top-10 finalist. *Finalist = best overall project* — optimize for finalist, not sponsor EV; the core work (opcodes, compiler, safety proof) double-counts toward both finalist and the 1inch/ENS prizes.
