# wave — 36h Hackathon Execution Plan

**Team:** Flaviano (spine) · Flavio (ENS + agentic) · Pietro (data + UI + pitch)
**Track:** ETHGlobal Lisboa 2026, Classic "from scratch" · **Build:** Fri Jul 24 → submit Sun Jul 26, 09:00 WEST
**Sponsor picks (3 max):** 1inch + The Graph + ENS · **Goal:** top-10 finalist
**Branches:** `feat/flaviano-spine` · `feat/flavio-agent-ens` · `feat/pietro-data-ui` (continuous commits; merge to `main` only at G1/G2/G3)
**Gates:** G1=h12 · G2=h24 · G3=h30. Times are offsets from kickoff (h0).
**Spine to defend:** Flaviano compiler (h0–16) → Flaviano VM/settle (h8–20) → Flavio agent (h20–24) → G2. Per-person detail: [Flaviano.md](./Flaviano.md) · [Flavio.md](./Flavio.md) · [Pietro.md](./Pietro.md). Specs: [10-10-PLAYBOOK.md](../strategy/10-10-PLAYBOOK.md) §1.5 · [frontend.md](../strategy/frontend.md).

| ☐ | Task | Person | Collab |
|---|---|---|---|
| ☐ | **Before kickoff** — `npm install` + `forge build && forge test -vvv` green from `swap-vm/`; `.env` shared (RPC, Sepolia, ENS-owner, Studio, Privy, Supabase, z.ai keys); repo on `main`, fresh branches; "Powered by SwapVM — © Degensoft Ltd 2025" in README + UI footer | All | — |
| ☐ | **Before kickoff** — Fund gas keys; rehearse anvil fork-cut script (read Chainlink `updatedAt`); `make deploy-swap-vm-aqua` works on local fork; TS compiler skeleton + `slots.json` gen/consume stubs; identify 5 spike files for the `git rm` | Flaviano | — |
| ☐ | **Before kickoff** — z.ai key + Foundry Agents SDK template scaffolded (smoke: prompt→bounded-form tool call); ENS-owner key funded; Sepolia ENS resolver current (`getText()` works); confirm `dock()`/`ship()` signature with Flaviano | Flavio | → Flaviano |
| ☐ | **Before kickoff** — Privy app + Supabase provisioned/migrated (`profiles,strategies,follows,likes,comments`); `docker compose up graph-node ipfs postgres` runs; Next.js bootstrapped with Privy + Supabase client | Pietro | — |
| ☐ | Freeze Zod spec v1 (`ast.ts`, `specVersion: 1`) + `EnsStrategyRouter` skeleton + frozen `StrategyDeployed(strategyId, programHash, ensNode)` event + ABI JSON | Flaviano | → Flavio (parse + resolveVerify), Pietro (fixtures + mapping) |
| ☐ | Foundry Agents SDK + z.ai scaffold (smoke: NL→bounded form); `register.ts` skeleton; confirm `recompileAndShip()`↔`dock()`/`ship()` signature | Flavio | ← Flaviano (spec + ABI) |
| ☐ | `demo/{timeline.ts,controller.ts}` (240s controller, `DEMO_LIVE=0`) + Supabase schema + Privy wrap; graph-node spike plan for standup | Pietro | ← Flaviano (spec) |
| ☐ | `git rm` the 5 spike files + untracked `swap-vm/` duplicate in a commit **preceding** rewrites; then `canonical.ts` (ordering + reorder diff) | Flaviano | Classic-track proof |
| ☐ | graph-node spike: index trivial one-event subgraph; burn down killers (instant-mine, fork-reset reorgs, `eth_getLogs` ranges). **Verdict at standup:** works / needs workarounds / arm `eth_getLogs` | Pietro | → Flaviano (deploy target), Flavio (`graphDelta` depends on it) |
| ☐ | Agent parse verified against Flaviano's frozen spec; ENS register base | Flavio | ← Flaviano (spec) |
| ☐ | Clean `_inventorySkew2D` + `_oracleGuard2D` rewrite (per §1.5, not spike) → stale-halt/clamp tests → `rules.ts` stubs (impl rules 1&2 first) → `ir.ts`/`emit.ts` (byte-identical, TS-direct) | Flaviano | — |
| ☐ | `register.ts` writes `v0.programhash` → `resolveVerify.ts` (negative path: tampered fixture → abort) | Flavio | ← Flaviano (`StrategyDeployed` ABI) |
| ☐ | UI scaffold (landing + 3-col feed shell on fixtures); feed card; `parseProgram`/`safetyReport`; `getFeed()` direct Server-Component query (Supabase counts + fixtures) | Pietro | ← Flaviano (spec) |
| ☐ | **G1 — walking skeleton** — clean opcodes + guard tests green; `slots.json` self-check (compiler + VM both Flaviano's, snapshot both sides); canonical reorder visibly fixes unsafe order; agent parse + `resolveVerify` abort works; landing→feed on fixture → **merge to `main`** | All | cut floor: keep `OracleGuardStaleHalt`+band-containment, `canonical.ts`+rules 1&2+TS-direct emit, fixture-only UI |
| ☐ | Liveness/additivity invariants → byte-identical emit + **disassembler** (hand to Pietro) → `programHash()` (hand to Flavio) | Flaviano | → Pietro (bytecode pane), Flavio (hash-verify input) |
| ☐ | Author `subgraph/{schema.graphql,mapping.ts,subgraph.yaml}`: `Strategy{id,programHash,ensNode}` + `Swap{amounts,cumulativeVolume}` | Pietro | → Flaviano (lands `graph deploy`) |
| ☐ | `graphDelta` skeleton (shared `shouldRetune()` threshold module, live + canned paths); `recompileAndShip()` action arm (wrap dock→recompile→ship) | Flavio | ← Flaviano (signature + router address) |
| ☐ | `graph deploy` of Pietro's subgraph on local graph-node; first real `Swapped` entity queryable → endpoint to Flavio + Pietro | Flaviano | ← Pietro (schema); → Flavio + Pietro (endpoint) |
| ☐ | Live `_oracleGuard2D` + deploy `MockAggregatorV3` + deviation/restore control script (Beat B arming — does not slide) | Flaviano | → Pietro (Beat B) |
| ☐ | `/compose` split-screen (+ required description) → SSE bridge to real `/compile` → `/[handle]` + `/s/[id]` → `EnsDiscovery` chip (via Flavio's client) | Pietro | ← Flaviano (disassembler), Flavio (client) |
| ☐ | Point `graphDelta` at live endpoint; verify real `Swapped` delta. **Studio insurance:** greenlight Sepolia+Studio publish only if G2 on track | Flavio | ← Flaviano (endpoint) |
| ☐ | Mutation harness (`MUTATION=M1|M2|M3 forge test`); pair with Flavio until retune fires through router | Flaviano | → Pietro (RED/GREEN proof) |
| ☐ | Commit swap-trace artifact: one trace showing `IAqua` pull/push + both opcodes + `Swapped` (the 1inch 30s proof) | Flaviano | — |
| ☐ | **Zero-click retune** (`graphDelta` delta→decision→`recompileAndShip()`→dock/ship); retune evidence log (entity ID, delta, decision, tx hash) streamed to Pietro | Flavio | → Pietro (retune badge + evidence) |
| ☐ | Render Flavio's retune evidence as badge + history; `getFeed()` joins Supabase (counts) + live Graph; follow/like/comment live as server actions | Pietro | ← Flavio (stream) |
| ☐ | **G2 — real pipeline** — autonomous retune zero-click (log cites entity ID); reject+rewrite+diff green; bytecode matches ENS hash; Flaviano re-reads 5 deleted spikes vs rewrites, confirms zero copy; full social feed + ENS chip live → **merge to `main`** | All | miss → `eth_getLogs` fallback labeled "subgraph syncing" (keeps demo, costs Graph track) |
| ☐ | `make demo-up` green **twice** (cut fork→deploy→register ENS→ship→reset graph-node→fixture swaps→battery→green checklist); subgraph re-sync < T-15min window; 240s dry-run recorded; canned twins for every beat | All | — |
| ☐ | **G3 — feature freeze** — demo + video + fallbacks only → **merge to `main`** | All | snapshot within 5% (CI gate); no new features |
| ☐ | Record RED/GREEN mutation split-screen; rehearse fresh-fork cut + backup-anvil RPC swap (≤15s) | Flaviano | demo with Pietro |
| ☐ | Pre-warm z.ai cache for Beat A (flake→Pietro narrates cached, retry silently); prep tampered-record fixture for Q&A | Flavio | — |
| ☐ | Full rehearsal against fresh fork; print failure tree ([frontend.md](../strategy/frontend.md) §8). **Never debug on stage past 20s** | Pietro | demo with Flaviano |
| ☐ | Submission prose: description + how-it's-made + 3 partner write-ups + feedback (Graph write-up MUST name subgraph + endpoints + cite retune entity IDs). Others: final fixture run + fallback recording | Pietro | — |
| ☐ | Submit; choose **"Finalist and Partner Prizes"** | All | buffer is the buffer |

**Per merge to `main`:** `forge build && forge test -vvv` green · snapshot ≤5% · `make demo-up` green once · no `node_modules/`/`cache/` tracked · continuous-commit history (not mass import).

**Risks (mitigations, owner):** Compiler↔VM drift → Flaviano single-owner `slots.json` self-check at G1 (Flaviano). graph-node won't sync fork → h2–4 spike + `eth_getLogs` fallback (Pietro builds, Flaviano deploys, Flavio consumes). Fork re-cut invalidates all → idempotent `make demo-up`, re-sync < T-15min (Pietro + Flaviano targets). Flavio overload → Studio/x402/ENSIP-26-richness are post-G2; never cut hash-verify or zero-click retune (Flavio). Flaviano bottleneck → protect sleep; mutation harness slides post-G2; Pietro authors subgraph so Flaviano only deploys (Flaviano). LLM flake at Beat A → 1500ms watchdog to cached-but-real, disclosed (Flavio).
