# Strategy Compiler — 36h Hackathon Execution Plan

**Team:** Flaviano (compiler + executer + settler) · Flavio (ENS + agentic) · Pietro (data + presentation + pitch)
**Track:** ETHGlobal Lisboa 2026, Classic "from scratch" · **Build:** Fri Jul 24 → submit Sun Jul 26, 09:00 WEST
**Sponsor picks (3 max):** 1inch + The Graph + ENS · **Goal:** top-10 finalist
**Branches:** `feat/flaviano-spine` · `feat/flavio-agent-ens` · `feat/pietro-data-ui`

> This is the **shared execution backbone** — checkpoints, parallel timeline, handoffs, shared files, validation. The per-person detail lives in [Flaviano.md](./Flaviano.md) · [Flavio.md](./Flavio.md) · [Pietro.md](./Pietro.md). Specs: compiler/opcodes in [10-10-PLAYBOOK.md](../strategy/10-10-PLAYBOOK.md) §1.5, UI/social in [frontend.md](../strategy/frontend.md), ops in [EVENT-RUNBOOK.md](../strategy/EVENT-RUNBOOK.md). All times are **offsets from kickoff (h0)**; gates G1=h12, G2=h24, G3=h30.

---

## Ownership (the slicing)

Each person is a **vertical**, not a horizontal slice — one owns the deterministic spine end-to-end, one owns identity + the agentic loop, one owns everything the judge sees.

| Person | Owns | One-line | Their sheet |
|---|---|---|---|
| **Flaviano** | **compiler + executer + settler** | the full deterministic spine: TS compiler (Zod→AST→IR→bytecode, reject-and-rewrite) → the two SwapVM opcodes + `StrategyRouter` → Aqua settlement → fork deploy. Everything between "an AI said something" and "safe bytecode settled on-chain." | [Flaviano.md](./Flaviano.md) |
| **Flavio** | **ENS + agentic** | identity (ENS resolveVerify / register / hash-verify) + the agentic brain (Foundry Agents SDK + z.ai, `graphDelta` retune decision, `recompileAndShip`, the LLM→bounded-form parse). | [Flavio.md](./Flavio.md) |
| **Pietro** | **data + presentation + pitch** | all data (first-party subgraph + Supabase) + the social UI (feed, compose, safety card, ENS chip) + demo choreography + all submission prose. Everything the judge sees. | [Pietro.md](./Pietro.md) |

> **Why this slicing:** Flaviano owns the deterministic compile→execute→settle spine end-to-end; Flavio owns identity + the agentic decision loop that consumes Flaviano's compiler and Pietro's data; Pietro owns the entire judge-facing surface (data + UI + pitch). Handoffs are at clean seams: Flaviano's compiler output → Flavio's VM; Pietro's subgraph endpoint → Flavio's agent; Flavio's `Rejection`/events → Pietro's cards.

**Reading order for a teammate:** this file (§) → your own sheet (`Flaviano.md` / `Flavio.md` / `Pietro.md`) → [strategy/10-10-PLAYBOOK.md](../strategy/10-10-PLAYBOOK.md) §1.5 (the opcode/compiler spec, the spine contract) → [strategy/frontend.md](../strategy/frontend.md) (the UI/social spec).

---

## The Oracle-Guard Spine (the one chain to defend)

```
Flaviano compiler (h0–16: spec→ast→canonical→emit)
  → Flaviano VM/settle (h8–20: opcodes→graph-deploy→live swap)
  → Flavio agent (h20–24: graphDelta→recompileAndShip→retune)
  → G2 (h24)
```

The compile→execute→settle spine is now **one person** (Flaviano), which eliminates the old emit↔opcode-table slot-drift class entirely. The two remaining seams: **Flaviano's `programHash`/events → Flavio's hash-verify/agent**, and **Pietro's subgraph endpoint → Flavio's `graphDelta`**. If Flaviano's clean `_oracleGuard2D` rewrite diverges from his own §1.5 spec, it cascades (his verdict gates nothing, his mutation fuzz goes false-RED, the live revert has no halt) — but that's now a self-consistency failure, not a cross-person one. **Defend this chain above all else.**

---

## Pre-Hackathon Checklist (BEFORE h0)

### All
- [ ] `npm install` in `srcs/requirements/swap-vm/`; `forge build && forge test -vvv` green from `srcs/requirements/swap-vm/`.
- [ ] `.env` template shared (RPC URLs, Sepolia key, ENS-owner key, Studio key, Privy keys, Supabase URL+key, z.ai key).
- [ ] Repo on `main`, in sync; everyone on fresh feature branches.
- [ ] "Powered by SwapVM — © Degensoft Ltd 2025" in README + UI footer (1inch compliance, from h0).

### Flaviano (compiler + executer + settler)
- [ ] Sepolia/mainnet-fork key funded with gas; anvil fork-cut script rehearsed (read Chainlink `updatedAt` at cut).
- [ ] `make deploy-swap-vm-aqua` targets work against a local fork.
- [ ] TS compiler skeleton compiles; `slots.json` generator + consumer stub ready (both sides are his).
- [ ] Confirm spike files identified for the h4 `git rm` (Classic-track: deletion precedes rewrite).

### Flavio (ENS + agentic)
- [ ] z.ai API key + Foundry Agents SDK template scaffolded locally (smoke test: one prompt → one bounded-form tool call).
- [ ] ENS-owner key funded (dust ETH); Sepolia ENS resolver address current (`getText()` works).
- [ ] `dock()`/`ship()` call signature confirmed with Flaviano (the `recompileAndShip` target).

### Pietro (data + presentation + pitch)
- [ ] Privy app created (client id); Supabase project provisioned, schema migrated (`profiles`, `strategies`, `follows`, `likes`, `comments`).
- [ ] `docker compose up graph-node ipfs postgres` runs locally; anvil as RPC.
- [ ] Next.js app bootstrapped; Privy provider wrap + Supabase client wired.

---

## Parallel Timeline

### h0 → CHECKPOINT 1: Interface Agreement (the spine root)
| Who | Delivers | Hand-off |
|---|---|---|
| **Flaviano** | **Frozen Zod spec v1** (`compiler/src/ast.ts`, `specVersion: 1`) **+** `EnsStrategyRouter` skeleton with frozen `StrategyDeployed(strategyId, programHash, ensNode)` event + ABI JSON | → Flavio (parse + `resolveVerify` target), Pietro (UI fixtures + subgraph mapping) |
| **Flavio** | Foundry Agents SDK + z.ai scaffold (smoke: NL → bounded form); ENS `register.ts` skeleton | confirms `recompileAndShip()` ↔ `dock()`/`ship()` signature with Flaviano |
| **Pietro** | `demo/{timeline.ts, controller.ts}` (240s controller, `DEMO_LIVE=0`) + Supabase schema + Privy wrap | standup: graph-node spike plan |

### h2–4 → Flaviano: compliance + canonical; Pietro: graph-node spike; Flavio: agent/ENS base
- **Flaviano h4 hard stop:** `git rm` the 5 spike files + the untracked `swap-vm/` duplicate (deletion commit precedes rewrite — Classic-track proof). Then `canonical.ts` (ordering + reorder diff).
- **Pietro:** burn down graph-node killers (anvil instant-mine, fork-reset reorgs, `eth_getLogs` ranges) on a trivial one-event subgraph. **Verdict at standup:** works / needs workarounds / arm the `eth_getLogs` fallback.
- **Flavio:** agent parse verified against Flaviano's frozen spec; ENS register base.

### h8–12 → Parallel core build
- **Flaviano:** clean `_inventorySkew2D` + `_oracleGuard2D` rewrite (per §1.5, not spike code) → stale-halt/clamp tests → rules stubs + IR/emit (byte-identical, TS-direct).
- **Flavio:** `register.ts` (writes `v0.programhash`) → `resolveVerify.ts` (negative path: tampered-record fixture → abort).
- **Pietro:** UI scaffold (signed-out landing + 3-col feed shell on fixtures); feed card component; `parseProgram`/`safetyReport`; `/api/feed`.

### h12 = G1 🟢 — CHECKPOINT 2: Walking Skeleton
- **Bars:** clean opcodes compile + guard tests green; Flaviano generates **`slots.json`** (self-check — compiler + VM are both his, snapshot tests both sides); Flaviano's canonical reorder visibly fixes an unsafe order; Flavio's agent parse + `resolveVerify` abort works; Pietro's landing→feed walking skeleton on fixture.
- **If missed:** runbook cuts (keep `OracleGuardStaleHalt` + band-containment; `canonical.ts` + rules 1&2 + TS-direct emit; fixture-only UI).

### h14–20 → Real pipeline wiring
- **Flaviano:** liveness/additivity invariants → byte-identical emit + **disassembler** (hand decoder to Pietro) → `programHash()` (hand to Flavio) → **`graph deploy`** of Pietro's subgraph on local graph-node, first real `Swapped` entity queryable, endpoint → Flavio + Pietro → live `_oracleGuard2D` + `MockAggregatorV3` for Beat B.
- **Flavio:** `graphDelta` skeleton (shared threshold module) → `recompileAndShip()` action arm (calls Flaviano's `dock()`/`ship()`) → point `graphDelta` at Flaviano's live endpoint.
- **Pietro:** `/compose` split-screen (+ required description field) → SSE bridge to real `/compile` → `/[handle]` + `/s/[id]` pages → `EnsDiscovery` chip (via Flavio's client).

### h20–24 → Autonomous retune (the Graph dealbreaker)
- **Flavio:** **zero-click retune** — `graphDelta` delta crosses threshold → decision → `recompileAndShip()` → dock/ship fires; retune evidence log (entity ID, delta, decision, tx hash) streamed to Pietro.
- **Flaviano:** mutation harness (`MUTATION=M1|M2|M3 forge test`) → pair with Flavio until retune fires through the router.
- **Pietro:** render Flavio's retune evidence as a badge + history on the card; `/api/feed` joins Supabase + live Graph; follow/like/comment live.

### h24 = G2 🟢 — CHECKPOINT 3: Real Pipeline
- **Bars:** autonomous retune fires zero-click (Flavio's log cites entity ID); reject+rewrite+diff green (Flaviano); bytecode matches ENS hash (Flavio verify); full social feed + ENS chip live (Pietro).
- **If missed:** `eth_getLogs` fallback (labeled "subgraph syncing") — keeps the demo, **honestly flags it costs the Graph track**.

### h24–30 → G3 freeze
- **All:** `make demo-up` green **twice** (cut fork → deploy → register ENS → ship → reset graph-node → fixture swaps → battery → green checklist); measure subgraph re-sync < T-15min fork-recut window. Full 240s dry-run recorded (= fallback video base). Canned twins for every beat. **Freeze at h30.**

### h34–35 → Demo proof + fork drill
- **Flaviano:** record RED/GREEN mutation split-screen; rehearse T-15 fresh-fork cut + backup-anvil RPC swap (≤15s).
- **Pietro:** full rehearsal against fresh fork; print the failure tree ([frontend.md](../strategy/frontend.md) §8).
- **Flavio:** pre-warm the z.ai cache for Beat A; prep tampered-record fixture for Q&A.

### Sunday 07:00–09:00 → Submission
- **07:00–08:30** Pietro: submission prose (description, how-it's-made, 3 partner write-ups + feedback; Graph write-up MUST name the subgraph, endpoints, and cite retune-log entity IDs). Others: final fixture run + fallback recording.
- **08:30–09:00** submit; choose **"Finalist and Partner Prizes"**. Buffer is the buffer.

---

## Shared Checkpoints (sync points — everyone attends)
- **h0** — Interface agreement (frozen Zod spec v1 + `StrategyDeployed` event + `recompileAndShip`↔`dock`/`ship` signature).
- **h12 = G1** — Walking skeleton (clean opcodes + `slots.json` self-check + agent parse + feed on fixture).
- **h24 = G2** — Real pipeline (autonomous retune + reject-and-rewrite + ENS hash match + social feed).
- **h30 = G3** — Feature freeze (demo + video + fallbacks only).
- **h34** — Demo proof recordings + T-15 fork-cut rehearsal.

---

## Handoff contract (who owes what, by when)

| From → To | Deliverable | Deadline |
|---|---|---|
| Flaviano → Flavio + Pietro | frozen Zod spec v1 + `StrategyDeployed` ABI + event signature | h0–2 |
| Flaviano → Flavio | `slots.json` (self-check, append-only after G1) | h12/G1 |
| Flaviano → Pietro | disassembler decoder (bytecode pane) | h14–16 |
| Flaviano → Flavio | `programHash()` (the agent's hash-verify input) | h16 |
| Pietro → Flaviano | `schema.graphql` + `mapping.ts` + `subgraph.yaml` | h16 |
| Flaviano → Flavio + Pietro | deployed subgraph endpoint + first `Swapped` entity | h18–20 |
| Flavio → Pietro | `Rejection`+diff payload + retune event stream (entity ID, delta, decision, tx hash) | h22–24 |
| Flavio → Pietro | ENS-resolution client for `EnsDiscovery` | h20–22 |
| Flaviano → Pietro | live `_oracleGuard2D` + `MockAggregatorV3` control (Beat B) | h20–22 |

---

## Definition of Done — checks per gate (general)

| Gate / Phase | When | Checks & tests that must pass | Owner of the bar |
|---|---|---|---|
| **h0 Interface Agreement** | h0–2 | - Zod spec frozen with `specVersion: 1` in `compiler/src/ast.ts`<br>- `StrategyDeployed(strategyId, programHash, ensNode)` event signature frozen<br>- ABI JSON exported to `docs/strategy/`<br>- `recompileAndShip()` ↔ `dock()`/`ship()` call signature confirmed in `agent/` and `compiler/`<br>- `forge build` green from `srcs/requirements/swap-vm/` | Flaviano (Zod + ABI), Flavio (signature), Pietro (consumption) |
| **h4 Compliance (Classic-track proof)** | h4 | - `git rm` of 5 spike files in one commit (preceding rewrites):<br>  `src/instructions/SpikeSkew.sol`<br>  `src/opcodes/StrategyOpcodes.sol`<br>  `src/routers/StrategyRouter.sol`<br>  `test/SpikeStrategy.t.sol`<br>  `test/base/AquaStrategyBuilders.sol`<br>- Untracked `swap-vm/` duplicate deleted<br>- Every new `.sol` has license header `// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1`<br>- `grep -r "SPDX-License-Identifier" srcs/requirements/swap-vm/src/` returns only valid headers | Flaviano |
| **G1 = h12 Walking Skeleton** | h12 | - `forge build` green from `srcs/requirements/swap-vm/`<br>- `forge test -vvv` all opcode tests green<br>- `forge snapshot --check --tolerance 5 --no-match-test "testFuzz_*"` passes<br>- `slots.json` generated by compiler, consumed by VM, tests byte-identical emit<br>- Canonical reorder visibly fixes an unsafe order (diff shows fix)<br>- Flavio's agent parses frozen Zod spec (unit tests pass)<br>- `resolveVerify.ts` aborts on tampered-record fixture (RED test, passes on real)<br>- Pietro's landing→feed UI renders fixture data (not blank screen) | Flaviano (forge + slots), Flavio (parse + resolveVerify), Pietro (UI fixture) |
| **h16–20 Real Pipeline Wiring** | h16–20 | - `forge test -vvv` liveness/additivity invariant tests green<br>- Disassembler decodes bytecode to human-readable moves (unit tests pass)<br>- `programHash()` exported from compiler (tests match known hashes)<br>- `graph deploy` succeeds on local graph-node<br>- Real `Swapped` entity queryable at subgraph endpoint (curl returns entity)<br>- Endpoint handed to Flavio's `graphDelta` (config file or env var)<br>- Live `_oracleGuard2D` passes Beat B oracle-stale test (RED when stale, GREEN when fresh)<br>- `MockAggregatorV3` control script updates price (test passes) | Flaviano (deploy + oracle), Pietro (subgraph), Flavio (consumes endpoint) |
| **G2 = h24 Real Pipeline** | h24 | - Autonomous zero-click retune: `graphDelta` delta crosses threshold → `recompileAndShip()` fires → `dock()`/`ship()` execute (e2e test passes)<br>- Retune evidence log contains: entity ID, delta value, decision, tx hash (log inspect shows all fields)<br>- Reject-and-rewrite green: `forge test --match-test "testRejectAndRewrite*"` passes<br>- Bytecode matches ENS hash: `resolveVerify.ts` passes on live strategy, aborts on tampered fixture (both paths tested)<br>- Full social feed renders: `/api/feed` returns Supabase + Graph union (not empty array)<br>- ENS chip renders on feed cards (not placeholder) | Flavio (retune + hash-verify), Flaviano (reject), Pietro (feed + chip) |
| **G3 = h30 Feature Freeze** | h30 | - `make demo-up` green **twice in a row** (fork cut → deploy → register → ship → reset graph-node → fixture swaps → battery passes)<br>- `forge snapshot --check --tolerance 5 --no-match-test "testFuzz_*"` within 5% (CI gate passes)<br>- Subgraph re-syncs in < 15min after fork recut (timer logged)<br>- Full 240s dry-run recorded (video file exists, playable)<br>- Canned twins exist for every demo beat (fixtures directory populated)<br>- No new features merged (freeze declared) | All (demo), Flaviano (snapshot), Pietro (subgraph + video) |
| **Merge Validation (per merge to main)** | Every merge | - `forge build` green from `srcs/requirements/swap-vm/`<br>- `forge test -vvv` all tests pass<br>- `forge snapshot --check --tolerance 5 --no-match-test "testFuzz_*"` passes<br>- `make demo-up` green once end-to-end<br>- `git ls-files | grep -E "node_modules/|cache/"` returns empty (no tracked deps)<br>- `git log --oneline -1` shows continuous-commit (not "mass import") | Flaviano (forge), Pietro (demo-up) |

---

## Step-by-step build ladder & merge points (general)

| Step | Hours | What ships | DoD check (gates the step) | Branch → merge point |
|---|---|---|---|---|
| **S1** | h0–2 | Frozen Zod spec v1, `StrategyDeployed` event + ABI, `recompileAndShip`↔`dock`/`ship` signature, agent scaffold, ENS register skeleton, Supabase schema + Privy wrap, demo controller skeleton | Zod spec frozen, ABI exported, signature confirmed, scaffold smokes pass | `feat/flaviano-spine`, `feat/flavio-agent-ens`, `feat/pietro-data-ui` → merge to `main` at h0 checkpoint |
| **S2** | h2–4 | Classic-track compliance (`git rm` 5 spikes), untracked duplicate deleted, `canonical.ts` (ordering + reorder diff), graph-node spike verdict, agent parse verified against spec | `git rm` commit precedes all rewrites, `grep` shows only valid licenses, graph-node verdict (works/needs fallback) | `feat/flaviano-spine`, `feat/flavio-agent-ens`, `feat/pietro-data-ui` → continuous commits, no merge |
| **S3** | h8–12 | Clean `_inventorySkew2D` + `_oracleGuard2D` rewrite, stale-halt/clamp tests, rules stubs + IR/emit (byte-identical), `register.ts`, `resolveVerify.ts` (negative path), UI scaffold (landing + feed on fixtures) | `forge test` opcodes + guards green, `slots.json` self-check passes, canonical reorder fixes unsafe diff, agent parse + resolveVerify abort works, UI renders fixtures | `feat/flaviano-spine`, `feat/flavio-agent-ens`, `feat/pietro-data-ui` → merge to `main` at G1/h12 |
| **S4** | h14–20 | Liveness/additivity invariants, byte-identical emit + disassembler, `programHash()`, `graph deploy` + live `Swapped` entity, `_oracleGuard2D` + `MockAggregatorV3` (Beat B), `graphDelta` skeleton, SSE bridge + `/[handle]` + `/s/[id]`, `EnsDiscovery` chip | `forge test` invariants green, disassembler unit tests pass, subgraph endpoint returns `Swapped` entity, `graphDelta` wired to endpoint, oracle-stale test passes, chip renders | `feat/flaviano-spine`, `feat/flavio-agent-ens`, `feat/pietro-data-ui` → continuous commits, no merge |
| **S5** | h20–24 | Zero-click retune (`graphDelta` → decision → `recompileAndShip` → dock/ship), retune evidence log, mutation harness, reject-and-rewrite, ENS hash-verify, full social feed (Supabase + Graph), follow/like/comment live | Autonomous retune fires (entity ID in log), `MUTATION=M1 forge test` paired with retune, reject+rewrite green, hash-verify passes, feed returns real data | `feat/flaviano-spine`, `feat/flavio-agent-ens`, `feat/pietro-data-ui` → merge to `main` at G2/h24 |
| **S6** | h24–30 | `make demo-up` idempotent world-builder, subgraph re-sync < 15min, 240s dry-run recorded, canned twins for all beats, mutation switch rehearsal, failure tree printout, z.ai cache pre-warm | `make demo-up` green twice, snapshot within 5%, re-sync timer logged, video file exists, twins present, switch RED/GREEN visible | `feat/flaviano-spine`, `feat/flavio-agent-ens`, `feat/pietro-data-ui` → merge to `main` at G3/h30 (feature freeze) |
| **S7** | h34–35 | Demo proof recordings, T-15 fork-cut rehearsal, fresh-fork drill, tampered-record fixture prep | Recordings complete, fork-cut ≤ 15s, fresh-fork demo green, fixture ready | `feat/flaviano-spine`, `feat/flavio-agent-ens`, `feat/pietro-data-ui` → continuous commits (prep only) |
| **S8** | Sun 07:00–09:00 | Submission prose (description, how-it's-made, 3 partner write-ups, Graph write-up with subgraph + endpoints + entity IDs), final fixture run, fallback recording | Write-up cites subgraph name, endpoints, retune entity IDs, fixture run green, fallback video exists | `feat/flaviano-spine`, `feat/flavio-agent-ens`, `feat/pietro-data-ui` → merge to `main` at Sunday 09:00 submission |

> **Note:** Merges to `main` happen ONLY at checkpoint sync points (h0, G1/h12, G2/h24, G3/h30, Sunday submission). Feature branches (`feat/flaviano-spine`, `feat/flavio-agent-ens`, `feat/pietro-data-ui`) commit continuously in between — this satisfies the Classic-track continuous-commit requirement.

---

## Shared File Ownership

| File / dir | Primary | Contributors |
|---|---|---|
| `srcs/requirements/swap-vm/` (Solidity core: opcodes, router, tests) | **Flaviano** | — |
| `srcs/requirements/compiler/` (TS compiler: ast, canonical, rules, ir, emit) | **Flaviano** | — (was cross-person; now one owner kills slot-drift) |
| `srcs/requirements/agent/` (Foundry SDK + z.ai, resolveVerify, register, graphDelta, recompileAndShip) | **Flavio** | Flaviano (event ABIs / `dock`/`ship` signature) |
| `srcs/requirements/subgraph/` (schema, mapping, yaml) | **Pietro** (author) + **Flaviano** (deploy) | Flavio (consumes endpoint) |
| `srcs/requirements/ui/` (Next.js, feed, compose, demo, `/api/feed`, `/api/social`) | **Pietro** | Flavio (Rejection/retune payloads) |
| Supabase schema + migrations | **Pietro** | — |
| `docs/strategy/frontend.md` | **Pietro** | — |
| `slots.json` (opcode-index map) | **Flaviano** (generates + consumes both sides) | — |

---

## Validation Checklist (per prize)

### 1inch — Aqua App ($5k, 1st $2.5k)
- [ ] Official Aqua/SwapVM contracts (modified redeploy allowed).
- [ ] **One live `swap()` through Aqua** (pull/push in trace, `Swapped` in fork logs, both opcodes in hot path).
- [ ] SwapVM license headers (`LicenseRef-Degensoft-SwapVM-1.1`) + "Powered by SwapVM — © Degensoft Ltd 2025" in README+UI.
- [ ] Proper git history (h4 spike deletion precedes rewrites); continuous commits.

### The Graph — AI Use Case ($4k, 1st $2k — our one winnable Graph track)
- [ ] **Live** data from a first-party subgraph (mocked/static disqualifies).
- [ ] **Load-bearing:** autonomous zero-click retune whose decision provably derives from a live subgraph entity delta; log cites the entity ID.
- [ ] Write-up names the subgraph + endpoints + cites retune-log entity IDs.
- [ ] `eth_getLogs` is a last-resort fallback, labeled honestly (not what judges see).

### ENS — AI Agents ($1.5k; auto-enters Creative $1.5k)
- [ ] **Hash-verify with the negative path shown live:** settle aborts on record↔program mismatch, passes on match; no hard-coded values.
- [ ] ENS chip on every feed card (discoverable + tamper-checked), not just the demo.
- [ ] **Flavio at the ENS booth Sunday morning — mandatory** (no-show forfeits $3k of auto-entered prizes).
- [ ] Say "draft standard" for ENSIP-25/26 (both are Drafts).

### Finalist (Technicality, Originality, Practicality, Usability, WOW)
- [ ] Judge-typed malicious intent → red REJECTED card + AST move-arrow + canonicalized bytecode (the WOW beat).
- [ ] Mutation switch: `MUTATION=M1 forge test` shows RED on bug, GREEN on real (Technicality 9→10).
- [ ] Determinism + disassembler round-trip property tests ("is it really a compiler?").
- [ ] Social feed + public descriptions (Usability); autonomous retune (WOW).

### Merge Validation (after each merge)
- [ ] `forge build && forge test -vvv` green from `srcs/requirements/swap-vm/`.
- [ ] Gas snapshot within 5% (`forge snapshot --check --tolerance 5 --no-match-test "testFuzz_*"`).
- [ ] `make demo-up` green once end-to-end.
- [ ] No `node_modules/` or `cache/` tracked (deps are npm + gitignored).

---

## Risks (cross-cutting)

- **Compiler↔VM drift** (emit byte-layout vs opcode table) → silent break → ENS hash-verify fails at G2. **Mitigation:** now a **single-owner self-check** (Flaviano owns both) — `slots.json` + snapshot tests on both sides at G1, append-only after. *This risk is much smaller under the new slicing* (was a two-person handshake). (Flaviano.)
- **graph-node won't sync the fork** → retune beat dies (Flavio's `graphDelta` has no input). **Mitigation:** Pietro spikes at h2–4; `eth_getLogs` fallback (costs the Graph track if it's what judges see). (Pietro builds + Flaviano deploys; Flavio consumes.)
- **Fork re-cut invalidates everything** (router address, ENS state, subgraph sync, oracle freshness). **Mitigation:** `make demo-up` idempotent world-builder; measure re-sync < T-15min window. (Pietro, deploy targets from Flaviano.)
- **Flavio overload** (ENS verify + agent parse + `graphDelta` + `recompileAndShip` + retune evidence) — the agentic brain is now one person on the G2 critical path. **Mitigation:** Studio insurance + x402 are post-G2 only; the retune evidence log reuses the shared threshold module; `recompileAndShip` is a thin wrap over Flaviano's `dock()`/`ship()`. Cut order: Studio → x402 → ENSIP-26 richness. Never the hash-verify or zero-click retune. (See [Flavio.md](./Flavio.md).)
- **Flaviano as single bottleneck** (compiler + VM + fork + deploy, h0–20 near-continuous). **Mitigation:** protect his sleep block; the mutation harness slides post-G2 before any spine work; Pietro owns the subgraph authoring so Flaviano only deploys. (See [Flaviano.md](./Flaviano.md).)
- **LLM flake at Beat A.** **Mitigation:** 1500ms watchdog → cached-but-real response (disclosed); Flavio retries silently.
