# The 10/10 Playbook — Build Plan for wave (a Finalist-Grade Strategy Compiler)

_This is the team's **build document**._

> **Read §0 first.** Finalist = best overall project. Optimize for finalist, not for sponsor EV.

**Operating principles:** (1) **Core depth** — glue doesn't survive a Q&A where judges probe the core → ~60% of build hours on the on-chain core. (2) **Pitch = mechanism** — the pitch sentence and the code's mechanism must be the same thing. (3) **Everything ships or gets cut** — no unwired subsystems in a 7-min slot; everything in the repo appears in the demo. **Roles:** P1 Solidity (opcodes, tests, Sepolia deploy) · P2 Agent (compiler, Graph, ENS) · P3 Product (UI, demo, video, compliance). **Q&A prep is a deliverable**, not an afterthought.

**Reading shelf:** Aqua SDK README · ENSIP-25/26 originals (say "draft standard") · Graph x402 docs · `swap-vm/test/` corpus (`Decay.t.sol`, `MakerHooks.t.sol`, `FeeIndifferencyToSwap.t.sol`) · the SwapVM 1.1 license (`LicenseRef-Degensoft-SwapVM-1.1`).

---

## §0 — The finalist reframe (prioritization logic)

**Finalist projects are the overall best projects**, judged on Technicality, Originality, Practicality, Usability, WOW. The sponsor prizes are a side game; finalist is *the* game. So optimize for finalist — and the winning realization is that **the core work double-counts**:

| Finalist criterion | The work that earns it | ALSO wins… |
|---|---|---|
| Technicality | two novel opcodes + mutation-killing invariant tests | **1inch** |
| Originality | "compiler for a swap VM" — reject-and-rewrite pass | **1inch** |
| Practicality | live `swap()` settling through Aqua on Sepolia | **1inch** |
| WOW | judge-triggered reject/revert on screen | (finalist-only) |
| Usability | split-screen intent→bytecode + safety card | (finalist-only) |

**Implications:**
1. **Concentrate, don't diversify.** Depth across 5 criteria comes from focus. The temptation to grab a 4th sponsor trades depth for breadth — that produces a B+ across six tracks, not an A across three.
2. **WOW and Usability are first-class, not leftovers.** No sponsor track rewards them directly, so they're the easiest to under-invest in — but finalist judges weight them. P3's split-screen + the judge-triggered revert are WOW/Usability plays.
3. **The sponsor floor (1inch + ENS) is a hedge against finalist-execution risk**, not the goal. Keep it; don't let it dilute the finalist push.

**Sponsor EV sanity check** (first-prize only, P(win) ranges are subjective estimates — push back on any):

| Config | Tracks | EV low–high | Notes |
|---|---|---|---|
| **A: 1inch + Graph + ENS (current)** | **4 winnable** (of 6 auto-entered) | **~$2.7k–$4.8k** | Core work double-counts toward finalist. **NB:** of the Graph tracks only **AI Use Case** (1st $2k) is a planned win; **AI Tooling** is auto-entered but not winnable, **Composable** is a conditional upside (see §4). Winnable set = 1inch + Graph AI Use Case + ENS Agents + ENS Creative. EV unchanged by the prize-figure correction — it was already built on the correct 1st-place values. |
| B: swap ENS → World | 4 winnable | ~$2.1k–$4.2k | World taxes the two good tracks (diverts hours), thin fit + exclusion risk. |

Config A wins on EV **and** is finalist-aligned. The only world where B wins: you're confident World AgentKit clears its exclusion list *and* builds cheaply (P(win) ≥ ~30%). Default: don't swap.

---

## §1 — The 10/10 Rubric (what "objective 10/10" means per perspective)

For each: the **bar**, the **reason a 9 fails to reach 10**, the **one observable proof**.

- **Technicality** — Bar: opcodes compile + deploy on Sepolia + `forge test` passes incl. 2+ mutation-killing fuzz invariants on `_oracleGuard2D`. 9→10 miss: a green suite with no invariant that *fails on a mutated opcode*. Proof: `forge test --match-test invariant_` shows RED on a forced mutation, GREEN on real code.
- **Originality** — Bar: a compiler pass (NL→AST→IR→bytecode) + two genuinely new opcodes absent from upstream. 9→10 miss: a "novel" opcode that's a renamed existing one. Proof: `git diff` vs 1inch upstream shows the two opcodes + compiler pass.
- **Practicality** — Bar: settles end-to-end on Sepolia, `quote() == swap()`. 9→10 miss: demo only ever calls `quote()`, never settles. Proof: a `Swapped` event in Sepolia logs (verifiable on Etherscan) with matching amounts.
- **Usability** — Bar: judge types intent, sees bytecode + green/red verdict within the *canned* fallback path. 9→10 miss: live-compile-only, no fallback. Proof: throttled demo, verdict card still renders <2s.
- **WOW** — Bar: a *live judge-triggered* action — typing a malicious intent and watching the compiler visibly REJECT it with a side-by-side diff. 9→10 miss: the reject is described, not shown. Proof: screen recording of reject→red card→canonicalized bytecode.
- **1inch Aqua App** — Bar: order settles *through Aqua* (pull/push), not plain transferFrom. 9→10 miss: uses Aqua router in name only. Proof: `IAqua` calls in trace + ship/dock logs.
- **Graph AI Use Case** — Bar: a deployed subgraph indexes `Swapped`; an agent reads a *real entity delta* to decide a retune. 9→10 miss: retune is time-triggered; Graph data is decorative. Proof: GraphQL returns a new entity after a swap; the agent's retune log cites that entity ID.
- **Graph AI Tooling** *(auto-entered, NOT winnable — the track needs reusable tooling not an app; the no-click cycle below actually strengthens **AI Use Case**, not this track)* — Bar: agent *autonomously* queries the subgraph and acts — a no-click cycle. 9→10 miss: every retune is a manual button. Proof: timestamped query→decision→resubmitted order with no human click.
- **Graph Composable** *(conditional **upside**, not a flat no — the earlier "requires a Messari schema" reading was wrong: the text says "e.g. Messari" and separately "**authoring/extending a Standardized Subgraph is in scope**", with the listed example "a new Standardized Subgraph for a protocol category that lacks one." Aqua is one — 1inch ships no indexer. Cost is schema discipline, not hours. Matches §4; weak spot is Breadth 20%)* — Bar: the subgraph schema is *reusable* (program hash, maker ENS, skew state), not a one-off. 9→10 miss: schema couples to internal test structs. Proof: `schema.graphql` consumable by an unrelated query.
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
- **Semantics:** implied price = `amountOut·1e18/amountIn` (direction+decimals normalized) → oracle read + staleness check (stale⇒revert) → **halt only when the implied price is unfavourable to the maker relative to the oracle by more than `maxDeviationBps` (ONE-SIDED — DECIDED)**: revert (mode 0) or clamp to band edge (mode 1, rounding favors maker). A price favourable to the maker never trips the guard — this is deliberate, because the guard is the OUTER wrapper and reads `amountOut` *after* the `_inventorySkew2D` penalty, which moves price in the maker's favour; a two-sided band would reject fills that are good for the maker (spurious halts under normal skew). **The two-sided behaviour is reserved as an unimplemented `flags` bit** (bit set ⇒ reject both directions) so the byte layout stays forward-compatible without doubling the test surface now. Clamp mode must preserve monotonicity at the kink (Move #2 test).
- **⚠️ Two-leg skew caveat (from PR #13 review):** the "skew moves price maker-wards" claim holds only for the **penalty leg** (deviation-increasing). The **improvement leg** (deviation-reducing, capped by `maxImproveBps`) is **taker-favoured** — so the one-sided guard does *not* spuriously fire there only because the spec clamps that improvement **inside the oracle band**. **Do not loosen `maxImproveBps` past the band** without re-deriving the guard's safety: if the improvement ever crosses the band edge, the one-sided guard would let a taker-favourable fill through on the wrong side. Decision stands (driven by the penalty leg); this is the load-bearing assumption behind it.

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
`router.quote()` on Sepolia: ~12 trade sizes × both directions × exactIn/exactOut ⇒ assert monotonic effective price, split-vs-single subadditivity, exactIn/exactOut symmetry within rounding, oracle-guard triggers on a mocked deviated feed, skew penalty ≤ cap.

### Dual-oracle demo design (live Sepolia) — ⚠️ the happy-path-staleness trap
**Measured:** Sepolia ETH/USD (`0x694AA1769357215DE4FAC081bf1f309aDC325306`) has a **~3600s (1h) heartbeat**, same as mainnet — so `maxStalenessSecs=7200` (2× heartbeat) is *adequate in steady state*, and the happy path will *usually* quote fine.
**But** the old T-15min fork cut existed specifically to **guarantee** a fresh `updatedAt` at demo time. Live Sepolia gives no such guarantee — testnet Chainlink feeds are known to lag past their heartbeat, and `_oracleGuard2D`'s staleness branch **always reverts, in both modes**. If the feed is stale while the judge watches, the demo **HALTs on the happy path** — the core beat runs backwards, and no fallback saves it (it's the guard working correctly, not a failure).
**Decision (the robust path):** the deployed **`MockAggregatorV3` serves BOTH the happy path and the deviation/halt scenario** (disclosed on the slide: *"testnet feeds are unreliable, so we drive the oracle ourselves for the demo — the guard logic is identical against either source"*). This removes all demo-time dependence on live-feed freshness. Real Chainlink is still wired and quoted on the safety card as the *production* source; the mock is the *demo* source. The breaker scenario is then just "push the mock to a deviated price" (same mock, same disclosure).



### MOVE #1 — Reject-and-Rewrite Compiler Pass (P2, P1 review, 8–10h)
Pure-TS deterministic compiler **after** the LLM's Zod spec, **before** Solidity: `Spec → AST → IR → BytecodePlan`. Either emits a canonical, safety-passing plan or throws a typed `Rejection` (rule violated + corrected rewrite + unified diff). Opcode indices come from the function-pointer array — **never hand-counted**.
- **Files:** `compiler/src/{ast,canonical,rules,ir,emit,reject}.ts`, `compiler/test/{canonical,reject}.test.ts`; Solidity `swap-vm/src/StrategyFactory.sol` (thin loop over `ProgramBuilder.build`).
- **Canonical order:** `Deadline → Concentrate → Decay → OracleGuard → InventorySkew → MakerFee → ProtocolFee → Curve → Salt`.
- **6 rejection rules:** `OracleGuardMustPrecedeSkew`, `ProtocolFeeLeMakerFee`, `SaltMustBeTerminal`, `OracleStalenessRequiresGuard`, `FeeAfterCurve`, `NoDuplicateDeadline`.
- **Timeline:** h8–10 AST+Zod freeze → h10–12 canonical+reorder diff → h14–16 IR slot-resolution (cast-decode the opcode table) + byte-identical emit + disassembler round-trip → h16–18 `programHash()` + ENS register, round-trip hash test → h20–22 reject rules + mutation-kill tests → h22–24 diff renderer for UI → h28–30 polish.
- **TS-direct emit is PRIMARY; on-chain `StrategyFactory` demoted to a post-G2 stretch.** Equivalence is proven via `quote()`-hash match, not a factory. (The `StrategyFactory.sol` file below is a stretch goal, not the spine.)
- **Demo proof (Act 1, 40s):** intent renders with oracleGuard *after* skew → red REJECTED card cites `OracleGuardMustPrecedeSkew`, shows AST move-arrow, emits corrected plan → shipped on Sepolia, `quote()` returns a price.
- **3am risk + fallback:** opcode-slot map desyncs after a P1 edit → revert. Fallback: drop on-chain `StrategyFactory`, emit bytecode directly in TS (already byte-identical), verify via `quote()` hash match.
- **Scope-cut floor:** `canonical.ts` + rules 1&2 + TS-direct emit. Still clears the bars.

### MOVE #2 — Mutation-Killing Invariant Tests (P1, ~9h)
Two property-test files proving the opcodes hold their safety contracts **and fail loudly on mutation**. Static context (`quote`/`asView`) — fast, fuzz-friendly, reusable as Move #1's pre-flight gate.
- **Files:** `test/mocks/MockOracle.sol`; `test/invariants/{OracleGuardStaleHalt,OracleGuardClamp,InventorySkewLiveness,InventorySkewAdditivity}.t.sol`; `test/base/StrategyInvariantBuilders.sol`.
- **Mutation harness (`make mutate-test`):** M1 drops the staleness revert; M2 flips clamp direction `>=`→`<=`; M3 makes penalty >1. Run each, screenshot RED.
- **Closes the "7 invariants" gap:** adds the missing **Liveness** (penalty capped <100% ⇒ never bricks) and **Additivity** (subadditive-or-equal over a size grid, mirroring `FeeIndifferencyToSwap.t.sol`).
- **Demo proof:** split-screen `forge test` GREEN on real code vs RED on M1/M2 mutation — failure-on-bug *is* the proof.
- **Scope-cut floor:** `OracleGuardStaleHalt` + `OracleGuardClamp` (band-containment) + M1/M2 toggles + one RED screenshot.

### MOVE #3 — Demo Choreography: Live Beats on Sepolia (P3, ~6h)
**No stage controller, no canned twins, no `DEMO_LIVE=0`, no fork.** A human drives the live product on `/` against **real Sepolia** state — strategies seeded before the event with real capital, real swaps, real indexing. Every beat is a real on-chain action a judge can verify on Etherscan. Full plan: [PROD-TESTNET.md](./PROD-TESTNET.md).
- **Beats → [frontend.md](./frontend.md) §4.** Briefly: Beat A the global ranked feed (real `returnPct × recency × followers` ranking of seeded strategies) → Beat B compose + ship (the description *is* the compiler input → bytecode → safety card → live `ship()` on Sepolia) → Beat C ENS-discover + **judge-triggered halt** (`MockAggregatorV3` deviated → `_oracleGuard2D` HALT on screen) → Beat D autonomous retune (real subgraph delta → `dock()`→recompile→`ship()`, **no-click**).
- **3am risk:** Sepolia RPC death / subgraph sync lag at a live beat. Fallback: a second funded wallet + backup RPC URL (Alchemy/Infura); for the retune beat, fall back to a direct `eth_getLogs` poll if the subgraph lags >a few blocks. No canned fallback exists — every failure is narrated honestly against the on-screen state.
- **Scope-cut floor:** the live feed + the live `ship()` + the judge-triggered halt; never cut those.

### MOVE #4 — Split-Screen UI + Safety Card (P3, ~5h)
**Next.js (App Router, SSR)** app owning **no business logic on the client** — panes consumed from the server agent's SSE stream (the UI's only data path). **Full UI spec — pages, routes, panes, data flow, colors, failure tree, build windows — lives in [frontend.md](./frontend.md).** Summary:
- Three panes + a 5th `EnsDiscovery` pane: left = NL intent + canonical block list; right = emitted bytecode tokenized `[op][len][args]`; bottom = green/red safety card; 5th = ENS subname→`programHash` side-by-side (mismatch→red, the ENS-prize evidence pane).
- Safety card green only if all 4 `quote()` numbers pass **and** program hash matches the ENSIP-25 record.
- **3am risk:** LLM/`/compile` stalls >2s. Fallback: 1500ms watchdog retries the live stream (disclosed); no canned `replay.json` to fall back to in the post-#4 world — if it stays down, narrate the on-screen state and move on. Never dead-air.
- **Scope-cut floor:** three panes + green/red card from live subgraph+ENS data only; never cut the verdict or the ENS-discovery pane.

### MOVE #5 — ENS Load-Bearing + First-Party Subgraph (P2 agent-side + P1 contracts, 6h)
**ENS** = identity layer: each strategy's subname carries ENSIP-25 + ENSIP-26 + a `v0.programhash` text record (= keccak256 of shipped bytecode). The taker agent resolves the subname, reads the hash, recomputes it from the live on-chain program, and **aborts on mismatch**. **Graph** = a first-party subgraph indexing your `Swapped` events (you own schema + liveness — kills the Messari-sync risk and the "mocked data" smell).
- **Files:** `swap-vm/src/routers/EnsStrategyRouter.sol` (StrategyRouter + post-ship hook emitting `StrategyDeployed(strategyId, programHash, ensNode)`); `packages/agent/src/ens/{resolveVerify,register}.ts`; `subgraph/{schema.graphql,mapping.ts,subgraph.yaml}`; `packages/agent/src/monitor/graphDelta.ts`.
- **Demo proof:** agent resolves subname → green "program-hash verified (0xab… == 0xab…)" → judge triggers swap → subgraph `cumulativeVolume` ticks +250 → delta crosses threshold → "RETUNE" → `dock()`→`ship()` fires autonomously.
- **3am risk:** local `graph-node` fails to sync the Sepolia subgraph. Fallback: bypass subgraph, poll `Swapped` via `eth_getLogs` directly (same threshold math), label source "logs (subgraph syncing)". **Never cut the hash-verify.**
- **Scope-cut floor:** hash-verify + `eth_getLogs` delta poll. Drop ENSIP-26 JSON and the volume rollup.
- **Ownership split:** P1 owns the Solidity hook + subgraph deploy; P2 owns the ENS agent-side (pure TS, pairs with the compiler).

---

## §3 — The 36-Hour Gantt (P1 / P2 / P3, gates G1=h12 / G2=h24 / G3=h30)

> **Role map (P1=Flaviano · P2=Flavio · P3=Pietro).** Ownership split (canonical = [`tasks/Flaviano.md`](../../tasks/Flaviano.md) / [`Flavio.md`](../../tasks/Flavio.md) / [`Plan.md`](../../tasks/Plan.md)): **P1 (Flaviano) owns the full deterministic spine — TS compiler (`ast.ts`, `canonical.ts`, `rules.ts`, `ir.ts`/`emit.ts`, disassembler, `programHash`, `slots.json`) + the two SwapVM opcodes + `EnsStrategyRouter` + Sepolia deploy + `graph deploy`.** **P2 (Flavio) owns identity + the agentic brain: ENS agent side (resolveVerify, register, hash-verify) + the agentic layer (Mastra + z.ai + custom MCP, `graphDelta` decision, `recompileAndShip`).** **P3 (Pietro) owns the full data→product stack (subgraph schema/mapping, `getFeed`, autonomous retune surface, UI, demo, prose).**
>
> ⚠️ **Cell placement updated for the reorg:** all compiler-spine cells (`ast.ts`, `canonical`, `rules`, `ir`/`emit`, `programHash`, `reject`, fuzz, `slots.json`) are now in **P1's column** — Flaviano owns the whole compiler→VM→deploy spine, so `slots.json` is a self-check, not a cross-person handshake. P2's column holds only genuine ENS + agentic work (cross-check against [`Flavio.md`](../../tasks/Flavio.md)). **The remaining staleness is P3's column** — `timeline.ts`/`controller.ts`/`liveSwap`/fixture references killed by #4 — which is a separate sweep (the demo-apparatus kill), not ownership.

| Window | P1 — Flaviano (Compiler + Executer + Settler: TS compiler + opcodes + router + Sepolia) | P2 — Flavio (ENS + Agentic: Mastra + z.ai + MCP) | P3 — Pietro (Subgraph + UI + demo) |
|---|---|---|---|
| **h0–2** | `EnsStrategyRouter` hook + `StrategyDeployed` 🔴; `ast.ts` + Zod freeze | Mastra agent skeleton (own container); ENS-owner key funded; Sepolia resolver ready | `timeline.ts` + `controller.ts` 🔴 *(pre-#4)* |
| **h2–4** | — | — | graph-node setup |
| **h8–10** | MockOracle + builders + clean opcode build; `canonical` + reorder diff | — | scaffold UI, 3 panes on fixture |
| **h10–12** | stale-halt + clamp tests; `rules` stubs + IR slot map | — | parseProgram + safetyReport |
| **h12 = G1** 🟢 | clean opcodes + guard tests green; **`slots.json` self-check (single-owner)** | — | walking skeleton on fixture |
| **h14–16** | liveness + additivity; `emit` byte-identical + disassembler (TS-direct) | — | liveSwap + mockOracle *(pre-#4)* |
| **h16–18** | `programHash()` + round-trip hash test | ENS register (writes records) | schema + mapping + `subgraph.yaml` (→ P1) |
| **h18–20** | `graph deploy` lands, real `Swapped` entity (owns Sepolia deploy infra) | `resolveVerify` into swap path; deliver `recompileAndShip()` to P3 at h20 | wire SSE to real /compile |
| **h20–22** | mutation harness M1/M2/M3; arm `_oracleGuard2D` + MockAggregator for Beat B | ENS-resolution client for `EnsDiscovery`; `graphDelta` poll + threshold module (`policy.decide`) | `EnsDiscovery` pane (UI) |
| **h22–24** | autonomous retune support through router; `reject rules` + diff renderer | **autonomous retune** (zero-click; `graphDelta` → `recompileAndShip`) | retune evidence log (display/badge) |
| **h24 = G2** 🟢 | autonomous retune fires; reject+rewrite+diff green; bytecode matches ENS hash | — | full live UI + ENS chip; retune log cites entity ID |
| **h28–30** | gas snapshot + quote==swap; swap-trace artifact; edge cases + fuzz specs + slot snapshot | — | full dry run + record fallbacks; `make demo-up` green ×2 |
| **h30 = G3** 🟢 | freeze | freeze | freeze |
| **h34–35** | demo proof recording; Sepolia seed idempotency check | demo support; LLM cache pre-warm | demo run (live Sepolia, human-driven, no controller) |

### Critical path — "the Oracle-Guard Spine"
`P1 (Flaviano) ast/spec (h0–2) → P1 opcode build (h8–10) → P1 ir/emit (h14–16) → P1 graph deploy (h18–20) → P2 (Flavio) autonomous retune (h22) → G2 (h24)`. **The whole compiler→VM→deploy spine is one person (Flaviano) now** — which is the point of the reorg: the slot-drift class (emit ↔ opcode-table desync across two people) is eliminated, because the same person owns both ends and `slots.json` becomes a self-check. If the clean `_oracleGuard2D` build diverges from spec, it cascades: the compiler's verdict has nothing to gate, the invariant fuzz goes false-RED, the live halt has no trigger. **The one chain to defend.** (P1 owns the *deploy*; P3 owns the *schema/mapping* authored at h16 and the retune *surface*; P2 owns the retune *execution* via `graphDelta` → `recompileAndShip`, consumed by P3's surface.)

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
| Practicality | `Swapped` in Sepolia logs (Etherscan), `quote()==swap()` | ✅ |
| Usability | Network-throttled: canned verdict card renders <2s | ✅ |
| WOW | Judge types malicious intent → red REJECTED card + canonicalized bytecode | ✅ |
| 1inch Aqua $5k | `IAqua` calls in trace + ship/dock/monitor logs | ✅ |
| Graph AI Use Case $3k (1st $2k / 2nd $1k) | GraphQL returns new Swap entity; agent log cites entity ID | ✅ — our one clean Graph track |
| Graph AI Tooling $5k ($2.5k/$1.5k/$1k) | requires *reusable tooling* (MCP/SKILL/plugin), not an app | ❌ not winnable (auto-entered only) |
| Graph Composable $3k (1st $2k / 2nd $1k) | qualifies by *authoring* a Standardized Subgraph for a category that lacks one — Aqua is one | ⚠️ conditional upside — schema discipline only, no extra hours |
| ENS Agents $1.5k | Settle reverts on hash mismatch, passes on match | ✅ |
| ENS Creative $1.5k | `ens.resolve` returns structured intent/hash/oracle-band fields | ✅ |

**\* Graph winnability** _(figures corrected against the official bounty page — see [../sponsors/the-graph/OVERVIEW.md](../sponsors/the-graph/OVERVIEW.md); the page's own summary paragraph contradicts its per-track listings and must not be used)_: our three tracks are **$5k AI Tooling / $3k AI Use Case / $3k Composable = $11k**. The "$15k" the page advertises only reaches that total by including **AI Use Case (Continuity) $4k**, which we cannot enter (Classic/from-scratch).

**Only AI Use Case is a planned win** (agent reasons over live data). **AI Tooling is off the table** — its qualification requires *reusable tooling/infrastructure (MCP/SKILL/plugin), not a single end-user app*; we auto-*enter* it by picking the partner but cannot *win* it, and per §6 we are not extracting a SKILL to chase it.

**Composable is a conditional upside, not the earlier flat "no".** The earlier reading ("requires a Messari schema") was wrong: the text reads "build meaningfully on a standardized schema (**e.g.** Messari…)" and separately "**Authoring/extending a Standardized Subgraph… is in scope**", with the listed example "*a new Standardized Subgraph for a protocol category that lacks one*". Aqua is exactly such a category — 1inch ships no indexer. Cost to qualify is **schema discipline, not hours**: author the subgraph as a generic *Aqua strategy* schema any Aqua app could reuse rather than one coupled to our structs. Weak spot is **Breadth (20%)** — one protocol. Treat as upside; do not reallocate hours and do not project the dollars.

Realistic Graph value: **one track, 1st $2k** (2nd $1k), plus the load-bearing "AI × live data" finalist story. Separately, the AI Use Case autonomous-retune beat still depends on local `graph-node` syncing the Sepolia subgraph by h22 — fallback is an `eth_getLogs` delta poll (labeled "subgraph syncing"), which keeps the AI Use Case bar.

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
