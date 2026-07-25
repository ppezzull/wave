# The 10/10 Playbook — Build Plan for wave (a Finalist-Grade Strategy Compiler)

_This is the team's **build document**._

> **Read §0 first.** Finalist = best overall project. Optimize for finalist, not for sponsor EV.

**Operating principles:** (1) **Core depth** — glue doesn't survive a Q&A where judges probe the core → ~60% of build hours on the on-chain core. (2) **Pitch = mechanism** — the pitch sentence and the code's mechanism must be the same thing. (3) **Everything ships or gets cut** — no unwired subsystems in a 7-min slot; everything in the repo appears in the demo. **Roles:** P1 Solidity (opcodes, tests, fork deploy) · P2 Agent (compiler, Graph, ENS) · P3 Product (UI, demo, video, compliance). **Q&A prep is a deliverable**, not an afterthought.

**Reading shelf:** Aqua SDK README · ENSIP-25/26 originals (say "draft standard") · Graph x402 docs · `swap-vm/test/` corpus (`Decay.t.sol`, `MakerHooks.t.sol`, `FeeIndifferencyToSwap.t.sol`) · the SwapVM 1.1 license (`LicenseRef-Degensoft-SwapVM-1.1`).

---

## §0 — The finalist reframe (prioritization logic)

**Finalist projects are the overall best projects**, judged on Technicality, Originality, Practicality, Usability, WOW. The sponsor prizes are a side game; finalist is *the* game. So optimize for finalist — and the winning realization is that **the core work double-counts**:

| Finalist criterion | The work that earns it | ALSO wins… |
|---|---|---|
| Technicality | two novel opcodes + mutation-killing invariant tests | **1inch** |
| Originality | "compiler for a swap VM" — reject-and-rewrite pass | **1inch** |
| Practicality | live `swap()` settling through Aqua on a fork | **1inch** |
| WOW | judge-triggered reject/revert on screen | (finalist-only) |
| Usability | split-screen intent→bytecode + safety card | (finalist-only) |

**Implications:**
1. **Concentrate, don't diversify.** Depth across 5 criteria comes from focus. The temptation to grab a 4th sponsor trades depth for breadth — that produces a B+ across six tracks, not an A across three.
2. **WOW and Usability are first-class, not leftovers.** No sponsor track rewards them directly, so they're the easiest to under-invest in — but finalist judges weight them. P3's split-screen + the judge-triggered revert are WOW/Usability plays.
3. **The sponsor floor (1inch + ENS) is a hedge against finalist-execution risk**, not the goal. Keep it; don't let it dilute the finalist push.

**Sponsor EV sanity check** (first-prize only, P(win) ranges are subjective estimates — push back on any):

| Config | Tracks | EV low–high | Notes |
|---|---|---|---|
| **A: 1inch + Graph + ENS (current)** | **4 winnable** (of 6 auto-entered) | **~$2.7k–$4.8k** | Core work double-counts toward finalist. **NB:** only Graph **AI Use Case** (1st $2k) qualifies; Graph AI Tooling + Composable are auto-entered but **not winnable** (see §4). Winnable set = 1inch + Graph AI Use Case + ENS Agents + ENS Creative. |
| B: swap ENS → World | 4 winnable | ~$2.1k–$4.2k | World taxes the two good tracks (diverts hours), thin fit + exclusion risk. |

Config A wins on EV **and** is finalist-aligned. The only world where B wins: you're confident World AgentKit clears its exclusion list *and* builds cheaply (P(win) ≥ ~30%). Default: don't swap.

---

## §1 — The 10/10 Rubric (what "objective 10/10" means per perspective)

For each: the **bar**, the **reason a 9 fails to reach 10**, the **one observable proof**.

- **Technicality** — Bar: opcodes compile + deploy on fork + `forge test` passes incl. 2+ mutation-killing fuzz invariants on `_oracleGuard2D`. 9→10 miss: a green suite with no invariant that *fails on a mutated opcode*. Proof: `forge test --match-test invariant_` shows RED on a forced mutation, GREEN on real code.
- **Originality** — Bar: a compiler pass (NL→AST→IR→bytecode) + two genuinely new opcodes absent from upstream. 9→10 miss: a "novel" opcode that's a renamed existing one. Proof: `git diff` vs 1inch upstream shows the two opcodes + compiler pass.
- **Practicality** — Bar: settles end-to-end on a real fork, `quote() == swap()`. 9→10 miss: demo only ever calls `quote()`, never settles. Proof: a `Swapped` event in fork logs with matching amounts.
- **Usability** — Bar: judge types intent, sees bytecode + green/red verdict within the *canned* fallback path. 9→10 miss: live-compile-only, no fallback. Proof: throttled demo, verdict card still renders <2s.
- **WOW** — Bar: a *live judge-triggered* action — typing a malicious intent and watching the compiler visibly REJECT it with a side-by-side diff. 9→10 miss: the reject is described, not shown. Proof: screen recording of reject→red card→canonicalized bytecode.
- **1inch Aqua App** — Bar: order settles *through Aqua* (pull/push), not plain transferFrom. 9→10 miss: uses Aqua router in name only. Proof: `IAqua` calls in trace + ship/dock logs.
- **Graph AI Use Case** — Bar: a deployed subgraph indexes `Swapped`; an agent reads a *real entity delta* to decide a retune. 9→10 miss: retune is time-triggered; Graph data is decorative. Proof: GraphQL returns a new entity after a swap; the agent's retune log cites that entity ID.
- **Graph AI Tooling** *(auto-entered, NOT winnable — the track needs reusable tooling not an app; the no-click cycle below actually strengthens **AI Use Case**, not this track)* — Bar: agent *autonomously* queries the subgraph and acts — a no-click cycle. 9→10 miss: every retune is a manual button. Proof: timestamped query→decision→resubmitted order with no human click.
- **Graph Composable** *(conditional — qualifies only if built on a standardized Messari schema or composing 2+ Graph products; our bespoke subgraph does neither, so treat as not-planned)* — Bar: the subgraph schema is *reusable* (program hash, maker ENS, skew state), not a one-off. 9→10 miss: schema couples to internal test structs. Proof: `schema.graphql` consumable by an unrelated query.
- **ENS AI Agents** — Bar: ENSIP-25/26 records carry the program hash; the agent *verifies* the on-chain program matches before settling. 9→10 miss: ENS only resolves name→address; hash never checked. Proof: settle reverts when recorded hash ≠ deployed hash, passes on match.
- **ENS Creative** — Bar: the subname/record structure *is* the artifact — discoverable, structured, trustable. 9→10 miss: a single opaque blob. Proof: `ens.resolve` returns structured fields (intent, hash, oracle band).

---

## §1.5 — Opcode & compiler spec (the P1↔P2 contract)

_System pipeline (LLM freedom only in step 1, inside per-block bounds; everything below deterministic — the answer to "why can't the agent deploy something harmful"):_
`NL intent → Zod-bounded DSL → deterministic compiler (canonical ordering) → ProgramFactory.buildProgram (Solidity, ProgramBuilder) → ISwapVM.Order → router.quote() simulation grid → aqua.ship() → ENS subname+records → monitor (Graph deltas) → dock()+recompile+ship().`

### `_inventorySkew2D` — wrapping instruction (parse args → runLoop → adjust amounts)
Keep maker inventory near a target ratio. **Two-sided v2** (adopted): deviation-*increasing* flow pays a growing penalty (capped `maxSkewBps`); deviation-*reducing* flow gets a price improvement capped at `maxImproveBps` **and never crossing the oracle-implied fair band**. Justification for a native opcode over `_extruction`: `Extruction.sol`'s header warns takers MUST validate external targets (non-upgradeable, can break quote/swap consistency) — a first-class instruction removes that trust surface. *Never claim "impossible via extruction"; cite their warning.*

| arg | type | meaning |
|---|---|---|
| `targetRatioE18` | uint64 | target balanceLt/(balanceLt+balanceGt) share, 1e18-scaled |
| `slopeBps` | uint16 | penalty bps per 10% post-trade deviation |
| `maxSkewBps` | uint16 | hard cap on total penalty |
| `maxImproveBps` | uint16 | v2: cap on improvement for deviation-reducing flow; runtime-clamped to oracle band |

Semantics (exactIn; exactOut mirrors with `ceilDiv`): run inner program → compute post-trade balances → `deviation = |share'(lt) − targetRatioE18|` → `penaltyBps = min(maxSkewBps, slopeBps × deviation/0.1e18)` only if trade increased deviation → `amountOut = amountOut × (BPS−penaltyBps)/BPS` (floor). Invariants: monotonicity (penalty non-decreasing in size), additivity (subadditive-or-equal — mirror `FeeIndifferencyToSwap.t.sol`; if super-additive appears, switch to pre-trade deviation), exactIn/exactOut symmetry, quote/swap consistency (automatic), liveness (penalty <100% ⇒ never bricks). **Empirics:** subadditive confirmed (single 20%=26bps vs split 10+10=25bps); `maxImproveBps` redundant (0% of cells), oracle band is the real bound (fires 47%).

### `_oracleGuard2D` — wrapping guard (`internal view`, works in `quote()` static context)
Maker-protection circuit breaker: reverts (mode 0) or clamps (mode 1) when implied price deviates from Chainlink beyond `maxDeviationBps`; **always reverts on staleness** (both modes — that's the halt). Differs from in-repo unwired `OraclePriceAdjuster` (theirs moves price toward oracle in taker's favor; ours refuses maker-unfavorable fills — opposite direction).
- **Args:** `oracleAddress` (20B, AggregatorV3) · `oracleDecimals` (1B, 0⇒read from oracle) · `maxStaleness` (2B secs; default **7200** = Chainlink ~3600s heartbeat + margin) · `maxDeviationBps` (2B) · `mode` (1B) · token-order flag (1B).
- **Semantics:** implied price = `amountOut·1e18/amountIn` (direction+decimals normalized) → oracle read + staleness check (stale⇒revert) → if `|implied−oracle|/oracle > maxDeviationBps`: revert or clamp to band edge (rounding favors maker). Clamp mode must preserve monotonicity at the kink (Move #2 test).

### Strategy-block DSL (what the LLM emits; Zod-validated, bounded, unknown types rejected)
Canonical order enforced by the Move #1 compiler: `deadline → concentration → decay → oracleGuard → inventorySkew → makerFee → protocolFee → curve → salt`. Rejection rules: `OracleGuardMustPrecedeSkew`, `ProtocolFeeLeMakerFee`, `SaltMustBeTerminal`, `OracleStalenessRequiresGuard`, `FeeAfterCurve`, `NoDuplicateDeadline`. `feed` resolves via a compiler-owned Chainlink registry (LLM picks a symbol, never an address). Example:
```jsonc
{ "pair": {"token0":"<addr>","token1":"<addr>"}, "size": {"amount0":"1.5","amount1":"3000"},
  "blocks": [
    {"type":"deadline","hours":24},
    {"type":"oracle-guard","feed":"ETH/USD","maxDeviationBps":150,"maxStalenessSecs":3600,"mode":"revert"},
    {"type":"inventory-skew","targetRatio":0.5,"slopeBps":20,"maxSkewBps":80},
    {"type":"maker-fee","bps":25}, {"type":"protocol-fee","bps":5,"receiver":"<addr>"},
    {"type":"curve","kind":"xyc"}
  ]}
```

### Simulation battery (gate before every ship; the report is a demo artifact)
`router.quote()` on the fork: ~12 trade sizes × both directions × exactIn/exactOut ⇒ assert monotonic effective price, split-vs-single subadditivity, exactIn/exactOut symmetry within rounding, oracle-guard triggers on a mocked deviated feed, skew penalty ≤ cap.

### Dual-oracle demo design (fork-staleness trap)
Chainlink feeds freeze at the fork block; demonstrating the breaker requires *moving* the oracle, which a real fork feed can't do. So: **happy path = real Chainlink on a fresh fork cut just after a feed update** (T-15min, read `updatedAt` at cut); **breaker scenario = `MockAggregatorV3` we control**, disclosed on slide ("we simulate the market moving — you can't move Chainlink on demand").



### MOVE #1 — Reject-and-Rewrite Compiler Pass (P2, P1 review, 8–10h)
Pure-TS deterministic compiler **after** the LLM's Zod spec, **before** Solidity: `Spec → AST → IR → BytecodePlan`. Either emits a canonical, safety-passing plan or throws a typed `Rejection` (rule violated + corrected rewrite + unified diff). Opcode indices come from the function-pointer array — **never hand-counted**.
- **Files:** `compiler/src/{ast,canonical,rules,ir,emit,reject}.ts`, `compiler/test/{canonical,reject}.test.ts`; Solidity `swap-vm/src/StrategyFactory.sol` (thin loop over `ProgramBuilder.build`).
- **Canonical order:** `Deadline → Concentrate → Decay → OracleGuard → InventorySkew → MakerFee → ProtocolFee → Curve → Salt`.
- **6 rejection rules:** `OracleGuardMustPrecedeSkew`, `ProtocolFeeLeMakerFee`, `SaltMustBeTerminal`, `OracleStalenessRequiresGuard`, `FeeAfterCurve`, `NoDuplicateDeadline`.
- **Timeline:** h8–10 AST+Zod freeze → h10–12 canonical+reorder diff → h14–16 IR slot-resolution (cast-decode the opcode table) + byte-identical emit + disassembler round-trip → h16–18 `programHash()` + ENS register, round-trip hash test → h20–22 reject rules + mutation-kill tests → h22–24 diff renderer for UI → h28–30 polish.
- **TS-direct emit is PRIMARY; on-chain `StrategyFactory` demoted to a post-G2 stretch.** Equivalence is proven via `quote()`-hash match, not a factory. (The `StrategyFactory.sol` file below is a stretch goal, not the spine.)
- **Demo proof (Act 1, 40s):** intent renders with oracleGuard *after* skew → red REJECTED card cites `OracleGuardMustPrecedeSkew`, shows AST move-arrow, emits corrected plan → shipped on fork, `quote()` returns a price.
- **3am risk + fallback:** opcode-slot map desyncs after a P1 edit → revert. Fallback: drop on-chain `StrategyFactory`, emit bytecode directly in TS (already byte-identical), verify via `quote()` hash match.
- **Scope-cut floor:** `canonical.ts` + rules 1&2 + TS-direct emit. Still clears the bars.

### MOVE #2 — Mutation-Killing Invariant Tests (P1, ~9h)
Two property-test files proving the opcodes hold their safety contracts **and fail loudly on mutation**. Static context (`quote`/`asView`) — fast, fuzz-friendly, reusable as Move #1's pre-flight gate.
- **Files:** `test/mocks/MockOracle.sol`; `test/invariants/{OracleGuardStaleHalt,OracleGuardClamp,InventorySkewLiveness,InventorySkewAdditivity}.t.sol`; `test/base/StrategyInvariantBuilders.sol`.
- **Mutation harness (`make mutate-test`):** M1 drops the staleness revert; M2 flips clamp direction `>=`→`<=`; M3 makes penalty >1. Run each, screenshot RED.
- **Closes the "7 invariants" gap:** adds the missing **Liveness** (penalty capped <100% ⇒ never bricks) and **Additivity** (subadditive-or-equal over a size grid, mirroring `FeeIndifferencyToSwap.t.sol`).
- **Demo proof:** split-screen `forge test` GREEN on real code vs RED on M1/M2 mutation — failure-on-bug *is* the proof.
- **Scope-cut floor:** `OracleGuardStaleHalt` + `OracleGuardClamp` (band-containment) + M1/M2 toggles + one RED screenshot.

### MOVE #3 — Demo Choreography: 3 Beats + Live Revert (P3, ~6h)
Deterministic 240-second stage controller driving the existing pipeline against a **fresh fork cut at T-15min**. Every beat has a canned replay twin (`DEMO_LIVE=0` swaps any live call for its recording). **One un-cannable call:** the live `swap()` (satisfies 1inch's on-chain-transfer bar).
- **Beat timeline (240s) + what each beat shows on screen → [frontend.md](./frontend.md) §4.** Briefly: Beat A ship (sentence→bytecode→safety card→live `ship()`) → Beat B ENS-discover + **judge-triggered revert** (`MockAggregatorV3` deviated → `_oracleGuard2D` HALT on screen) → Beat C retune (on-fork delta → `dock()`→recompile→`ship()`, **autonomous no-click**) → compliance card.
- **3am risk:** fork RPC death at Beat B. Fallback: backup anvil on laptop B, P1 swaps RPC ≤15s; if >20s, `DEMO_LIVE=0` → canned, *except* retry live `swap()` once.
- **Scope-cut floor:** Beats A + B-revert only; never cut the live `swap()` or the judge-triggered halt.

### MOVE #4 — Split-Screen UI + Safety Card (P3, ~5h)
**Next.js (App Router, SSR)** app owning **no business logic on the client** — panes consumed from the server agent's SSE stream (the UI's only data path). **Full UI spec — pages, routes, panes, data flow, colors, failure tree, build windows — lives in [frontend.md](./frontend.md).** Summary:
- Three panes + a 5th `EnsDiscovery` pane: left = NL intent + canonical block list; right = emitted bytecode tokenized `[op][len][args]`; bottom = green/red safety card; 5th = ENS subname→`programHash` side-by-side (mismatch→red, the ENS-prize evidence pane).
- Safety card green only if all 4 `quote()` numbers pass **and** program hash matches the ENSIP-25 record.
- **3am risk:** LLM/`/compile` stalls >2s. Fallback: 1500ms watchdog swaps the live stream to a canned `replay.json` (disclosed cached). Never dead-air.
- **Scope-cut floor:** three panes + green/red card from fixture JSON only; never cut the verdict or the ENS-discovery pane.

### MOVE #5 — ENS Load-Bearing + First-Party Subgraph (P2 agent-side + P1 contracts, 6h)
**ENS** = identity layer: each strategy's subname carries ENSIP-25 + ENSIP-26 + a `v0.programhash` text record (= keccak256 of shipped bytecode). The taker agent resolves the subname, reads the hash, recomputes it from the live on-chain program, and **aborts on mismatch**. **Graph** = a first-party subgraph indexing your `Swapped` events (you own schema + liveness — kills the Messari-sync risk and the "mocked data" smell).
- **Files:** `swap-vm/src/routers/EnsStrategyRouter.sol` (StrategyRouter + post-ship hook emitting `StrategyDeployed(strategyId, programHash, ensNode)`); `packages/agent/src/ens/{resolveVerify,register}.ts`; `subgraph/{schema.graphql,mapping.ts,subgraph.yaml}`; `packages/agent/src/monitor/graphDelta.ts`.
- **Demo proof:** agent resolves subname → green "program-hash verified (0xab… == 0xab…)" → judge triggers swap → subgraph `cumulativeVolume` ticks +250 → delta crosses threshold → "RETUNE" → `dock()`→`ship()` fires autonomously.
- **3am risk:** local `graph-node` fails to sync the fork. Fallback: bypass subgraph, poll `Swapped` via `eth_getLogs` directly (same threshold math), label source "logs (subgraph syncing)". **Never cut the hash-verify.**
- **Scope-cut floor:** hash-verify + `eth_getLogs` delta poll. Drop ENSIP-26 JSON and the volume rollup.
- **Ownership split:** P1 owns the Solidity hook + subgraph deploy; P2 owns the ENS agent-side (pure TS, pairs with the compiler).

---

## §3 — The 36-Hour Gantt (P1 / P2 / P3, gates G1=h12 / G2=h24 / G3=h30)

> **Role map (P1=Flaviano · P2=Flavio · P3=Pietro).** Ownership split: P3 (Pietro) owns the full data→agent→product stack (`graphDelta` + autonomous retune + subgraph schema/mapping); P2 (Flavio) owns compiler + ENS-register/verify; P1 (Flaviano) owns the opcodes, fork deploy, `graph deploy`, and the subgraph's on-chain landing.

| Window | P1 — Flaviano (Solidity + fork) | P2 — Flavio (Compiler + ENS agent) | P3 — Pietro (Subgraph + agent + UI + demo) |
|---|---|---|---|
| **h0–2** | #5: `EnsStrategyRouter` hook + `StrategyDeployed` + hash-match test 🔴 | #1: `ast.ts` + Zod freeze | #3: `timeline.ts` + `controller.ts` 🔴 |
| **h2–4** | — | — | #5: graph-node setup |
| **h8–10** | #2: MockOracle + builders + clean opcode build | #1: canonical + reorder diff | #4: scaffold UI, 3 panes on fixture |
| **h10–12** | #2: stale-halt + clamp tests | #1: rules stubs + IR slot map | #4: parseProgram + safetyReport |
| **h12 = G1** 🟢 | clean opcodes + guard tests green; **`slots.json` handshake** | reorder visibly fixes order | walking skeleton on fixture |
| **h14–16** | #2: liveness + additivity | #1: emit byte-identical + disassembler (TS-direct; factory demoted) | #3: liveSwap + mockOracle |
| **h16–18** | — | #1: `programHash()` + round-trip hash test; ENS register | #5: schema + mapping + `subgraph.yaml` (authored, handed to P1) |
| **h18–20** | #5: `graph deploy` lands, real `Swapped` entity (owns fork infra) | #5: `resolveVerify` into swap path; deliver `recompileAndShip()` to P3 at h20 | #4: wire SSE to real /compile |
| **h20–22** | #2: mutation harness M1/M2/M3; arm `_oracleGuard2D` + MockAggregator for Beat B | #5: ENS-resolution client for `EnsDiscovery` | #5: `graphDelta` poll + `EnsDiscovery` (shared threshold module) |
| **h22–24** | #5: end-to-end autonomous retune support through his router | #1: reject rules + diff renderer | #5: **autonomous retune** (zero-click; `graphDelta` → `recompileAndShip`); retune evidence log |
| **h24 = G2** 🟢 | autonomous retune fires through router | reject+rewrite+diff green; bytecode matches ENS hash | full live UI + ENS chip; retune log cites entity ID |
| **h28–30** | #2: gas snapshot + quote==swap; swap-trace artifact | #1: edge cases + fuzz specs; slot snapshot test | full dry run + record fallbacks; `make demo-up` green ×2 |
| **h30 = G3** 🟢 | freeze | freeze | freeze |
| **h34–35** | demo proof recording; T-15 fresh-fork cut | demo support; LLM cache pre-warm | demo run (controller + narration) |

### Critical path — "the Oracle-Guard Spine"
`P2 (Flavio) ast/spec (h0–2) → P1 (Flaviano) opcode build (h8–10) → P2 ir/emit (h14–16) → P1 graph deploy (h18–20) → P3 (Pietro) autonomous retune (h22) → G2 (h24)`. If the clean `_oracleGuard2D` build diverges from spec, it cascades: Move #1's verdict has nothing to gate, Move #2 fuzz goes false-RED, the live revert has no halt. **The one chain to defend.** (P1 owns the *deploy*; P3 owns the *schema/mapping* authored at h16 and the *retune* at h22 — see the §3 table.)

### Gate bars (aligns EVENT-RUNBOOK.md)
- **G1 (h12):** clean opcodes + stale-halt/clamp tests green; compiler reorder visibly fixes order; UI walking skeleton on fixture.
- **G2 (h24):** autonomous retune fires (zero manual); reject+rewrite+diff green; bytecode matches ENS hash; full live UI + ENS chip.
- **G3 (h30):** feature freeze — demo choreography + video + fixtures only.

---

## §4 — The 10/10 Scorecard (11 perspectives)

| Perspective | Observable delivered | Clears bar? |
|---|---|---|
| Technicality | `invariant_` RED on M1/M2 mutation, GREEN real, in repo diff | ✅ |
| Originality | `git diff` vs 1inch: 2 new opcodes + reject-and-rewrite pass, absent upstream | ✅ |
| Practicality | `Swapped` in fork logs, `quote()==swap()` | ✅ |
| Usability | Network-throttled: canned verdict card renders <2s | ✅ |
| WOW | Judge types malicious intent → red REJECTED card + canonicalized bytecode | ✅ |
| 1inch Aqua $5k | `IAqua` calls in trace + ship/dock/monitor logs | ✅ |
| Graph AI Use Case $4k (1st $2k) | GraphQL returns new Swap entity; agent log cites entity ID | ✅ — our one clean Graph track |
| Graph AI Tooling $7k | requires *reusable tooling* (MCP/SKILL/plugin), not an app | ❌ not winnable (auto-entered only) |
| Graph Composable $4k | needs 2+ Graph products OR a standardized (Messari) schema; our bespoke subgraph does neither | ⚠️ conditional — not planned |
| ENS Agents $1.5k | Settle reverts on hash mismatch, passes on match | ✅ |
| ENS Creative $1.5k | `ens.resolve` returns structured intent/hash/oracle-band fields | ✅ |

**\* Graph winnability:** of The Graph's 3 tracks ($7k AI Tooling / $4k AI Use Case / $4k Composable — summing to the stated $15k), **only AI Use Case qualifies** (agent reasons over live data). **AI Tooling is off the table** — its qualification requires *reusable tooling/infrastructure (MCP/SKILL/plugin), not a single end-user app*; we auto-*enter* it by picking the partner but cannot *win* it. **Composable** would need building on a standardized (Messari DEX AMM) schema or composing 2+ Graph products — our bespoke first-party subgraph (chosen to kill the Messari-sync risk) does neither, so it is **not a planned win**. Realistic Graph value: **one track, 1st ~$2k**, plus the load-bearing "AI × live data" finalist story. Separately, the AI Use Case autonomous-retune beat still depends on local `graph-node` syncing the fork by h22 — fallback is an `eth_getLogs` delta poll (labeled "subgraph syncing"), which keeps the AI Use Case bar. **Do not project Tooling or Composable dollars.**

---

## §5 — Compliance Heartbeat (every ~4h, protects Classic-track eligibility)

- **h4:** confirm all new contracts are implemented from scratch (no upstream strategy code reused). Commit-log shows fresh authorship preceding new code.
- **h8:** SPDX `LicenseRef-Degensoft-SwapVM-1.1` headers + `@custom:license-url` on all new `.sol`. Append AI-attribution log entry.
- **h12 (G1):** `git status` clean, all green tests committed. Snapshot which artifacts are AI-assisted.
- **h16:** commit subgraph schema as first-party (no sponsor-repo copy). Confirm no Messari / heal-side code present.
- **h20:** `Powered by SwapVM — © Degensoft` card exists in UI. License-header sweep.
- **h24 (G2):** confirm all new code is original (logic re-derived, no copy from references).
- **h28:** `forge test` clean on `ci` profile, gas snapshot within 5%.
- **h34:** attribution in README + demo closing card. Submit at h36.

---

## §6 — The Kill List (zero hours)

- No standalone MCP/SKILL for Graph Tooling (wrapper smell).
- No bidirectional multi-subgraph composability (scope-creep; not a prize bar).
- No Messari sync dependency (replaced by first-party subgraph).
- No ENSIP-26 offchain resolver dependency (cosmetic; direct-registry fallback).
- No heal-side discount demo beat (empirics ~0; build WOW on the oracle-clamp instead).
- No live-compile-only split-screen (must have canned latency fallback — Move #4 watchdog).
- No pivot, no sponsor change (tweak, not pivot).

**Start at h0: P1 on the ENS hook, P2 on the spec, P3 on the timeline skeleton. Go.**
