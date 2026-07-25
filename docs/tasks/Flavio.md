# Flavio — ENS + Agentic (P2)

## Mission
Own **identity + the agentic brain**: the ENS agent side (resolveVerify, register, program-hash verify) and the agentic layer ([Foundry Agents SDK](https://www.palantir.com/docs/foundry/agents/overview) + **z.ai** LLM) — the LLM→bounded-form parse, `graphDelta` retune decision, and `recompileAndShip()` action arm. You don't write the compiler or the VM (that's Flaviano) and you don't build the UI or subgraph (that's Pietro); you're the **reasoning + identity layer** that sits between them: parse intent → hand Flaviano a bounded spec; read Pietro's subgraph → decide → call Flaviano's `dock()`/`ship()`. Your work wins the **ENS AI Agents prize ($1.5k; auto-enters Creative $1.5k)** and the **Graph AI Use Case** load-bearing story (the agent reasons over Pietro's live data). Carries finalist **Originality + WOW**.

> **Your contracts:** Flaviano's frozen Zod spec + `StrategyDeployed` ABI (h0–2) = your parse target + verify target. Pietro's subgraph endpoint (h18–20) = your `graphDelta` input. [frontend.md](../strategy/frontend.md) = the card payloads you owe Pietro.

## Hour-by-hour

**h0–2 — agentic scaffold + ENS register base 🔴**
- Stand up the **Foundry Agents SDK** template (agent logic = prompt + tool defs + stream handler) with **z.ai** as the LLM provider. Smoke test: one NL prompt → z.ai returns a bounded Zod-validated form (the LLM fills the form; it writes no code). Confirm Flaviano's frozen `specVersion: 1` ast.ts against your parse output.
- `srcs/requirements/agent/src/ens/register.ts` skeleton: register the strategy subname on the fork (mainnet fork has the real ENS registry — no hard-coded values), write ENSIP-25 records. Per chair ruling #3: records are **verifiable, not read at execution time**.

**h8–10 — ENS register + `programHash` wiring**
- Complete `register.ts`: write the `v0.programhash` text record from Flaviano's h16 `programHash()` (= keccak of shipped bytes). Mainnet-fork ENS registry; no hard-coded values.

**h10–12 — `resolveVerify` into the swap path**
- `srcs/requirements/agent/src/ens/resolveVerify.ts`: resolve subname → read recorded hash → recompute from the live on-chain program → **abort on mismatch**. Build the negative path deliberately (tampered-record fixture) — the ENS judge's proof is the **red abort**, not the green check. Target Flaviano's `StrategyDeployed` ABI.

**h12 = G1 🟢** — bar: agent parse (NL→bounded form) works against Flaviano's frozen spec; `resolveVerify` aborts on the tampered fixture.

**h14–16 — `graphDelta` skeleton (the retune decision)**
- `srcs/requirements/agent/src/monitor/graphDelta.ts`: poll the subgraph endpoint (Flaviano deploys Pietro's subgraph h18–20 — stub against a fixture endpoint for now). **Shared threshold module** consumed by both live and canned paths (chair ruling #2: replay is the fallback, never a different code path).

**h16–18 — `recompileAndShip()` action arm**
- Wrap `dock()` → recompile (Flaviano's compiler) → `ship()` into one callable module (in-process, imported by the Next.js server). This is the retune's action arm — without it the autonomous loop has nothing to fire. Confirm the `dock()`/`ship()` signature with Flaviano at h0.

**h18–20 — wire `graphDelta` to Flaviano's live endpoint**
- Point `graphDelta` at the real subgraph URL Flaviano hands off at h18–20; verify a real `Swapped` entity delta is readable. **Studio insurance decision (§1 #9):** if on time, greenlight Sepolia+Studio publish (insures "local graph-node isn't a Graph provider" reading) — only if G2 is on track.

**h20–22 — retune evidence log + ENS-resolution client for Pietro**
- Every autonomous retune writes a timestamped record — GraphQL query, **entity ID**, delta values, threshold decision, `dock()`/`ship()` tx hashes — committed to repo and streamed to Pietro's UI (the retune badge + evidence pane). Hand Pietro the ENS-resolution client his `EnsDiscovery` pane calls.
- Deliver `recompileAndShip()` to the autonomous loop (was h20 target — confirm live).

**h22–24 = G2 🟢 — the autonomous retune (your dealbreaker hours)**
- Zero-click loop: subgraph delta crosses threshold → decision → `recompileAndShip()` → dock/ship fires. The retune evidence log cites the **entity ID**. G2 bar: retune fires with zero manual trigger, decision provably from a live subgraph delta.
- If missed: runbook fallback — Pietro's `eth_getLogs` poll with your same threshold module, labeled "logs (subgraph syncing)"; keeps the demo, **honestly flags it costs the Graph track**.

**h28–30 → G3 (h30) 🟢 — robustness + fuzz**
- Fuzz the agent parse through Zod: every input either yields a valid bounded form or throws a typed error (never a crash, never free-form code). The round-trip hash test (emit keccak == ENS record == on-chain program) in CI. Freeze h30.

**h34–35 — demo support** — pre-warm the z.ai cache for Beat A (runbook failure tree: flake → Pietro narrates the cached-but-real response, you retry silently). Prep tampered-record fixture for Q&A.

## Definition of Done — checks & tests per step

| Step (hours) | What "done" looks like — checks & tests |
|--------------|------------------------------------------|
| h0–2 | z.ai smoke test passes: one NL prompt → z.ai returns a Zod-validated bounded form; LLM writes no code. `tsc --noEmit` on agent scaffold passes. `register.ts` compiles and writes a test record to forked mainnet ENS registry. |
| h8–10 | `register.ts` writes `v0.programhash` text record to forked ENS registry; test fixture reads back the exact keccak value emitted by Flaviano's `programHash()`. |
| h10–12 | `resolveVerify.ts` negative path passes: tampered-record fixture → settle ABORTS with the typed error selector (the red abort is the ENS judge's proof). Positive path: live on-chain program hash == resolved ENS record. |
| h12 = G1 | z.ai parse test: NL→bounded form against Flaviano's frozen spec succeeds. `resolveVerify` negative test aborts with typed selector. `tsc --noEmit` passes on all agent code. |
| h14–16 | `graphDelta.ts` stub polls fixture endpoint; test asserts non-empty delta returned. Shared threshold module (`shouldRetune()`) has unit tests covering edge cases (zero delta, negative delta, exact threshold). |
| h16–18 | `recompileAndShip()` module compiles; integration test calls `dock()` → recompile → `ship()` and returns non-empty tx hashes. Signature matches Flaviano's router. |
| h18–20 | `graphDelta` pointed at live subgraph URL; test polls and asserts real `Swapped` entity delta is readable (non-empty response). Studio insurance gate documented: only greenlit IF G2 on track (checked manually). |
| h20–22 | Retune evidence log writes a test record with all required fields (timestamp, GraphQL query, entity ID, delta values, threshold decision, dock/ship tx hashes). ENS-resolution client `tsc --noEmit` passes. |
| h22–24 = G2 | Zero-click retune end-to-end test: stub subgraph delta crosses threshold → `shouldRetune()` returns true → `recompileAndShip()` fires → dock/ship tx hashes emitted. Retune evidence log cites the entity ID. No manual trigger. |
| h28–30 → G3 | Fuzz test through Zod passes: for 100+ varied NL inputs, each yields either valid bounded form OR typed error — never crash, never free-form code. Round-trip hash chain test: compiler-emitted keccak == ENS `v0.programhash` record == recomputed on-chain hash — all three asserted equal. |
| h34–35 | Demo rehearsal: Beat A (parse → safety card → ship) runs without LLM timeout; z.ai cache pre-warmed. Tampered-record fixture ready for Q&A; negative path abort visible. |

## Step-by-step build ladder & merge points

| Step | Hours | What ships | DoD check (gates it) | Branch → merge point |
|------|-------|------------|---------------------|---------------------|
| S1 | h0–2 | Foundry Agents SDK scaffold + z.ai integration stub; `register.ts` skeleton | z.ai smoke test passes; `tsc --noEmit` passes | `feat/flavio-agent-ens` |
| S2 | h8–10 | Complete `register.ts` with `v0.programhash` wiring | Test writes and reads back exact keccak from ENS record | `feat/flavio-agent-ens` |
| S3 | h10–12 | `resolveVerify.ts` with negative path | Tampered fixture aborts with typed selector; hash equality passes | `feat/flavio-agent-ens` |
| S4 | h12 = G1 | Parse + verify working | G1 checks pass → merge to `main` | `feat/flavio-agent-ens` → `main` |
| S5 | h14–16 | `graphDelta.ts` skeleton + shared threshold module | Stub poll returns delta; threshold unit tests pass | `feat/flavio-agent-ens` |
| S6 | h16–18 | `recompileAndShip()` action arm | Integration test fires dock → recompile → ship with tx hashes | `feat/flavio-agent-ens` |
| S7 | h18–20 | Live subgraph wiring | Real `Swapped` entity delta readable from endpoint | `feat/flavio-agent-ens` |
| S8 | h20–22 | Retune evidence log + ENS-resolution client | Log writes all required fields; client `tsc --noEmit` passes | `feat/flavio-agent-ens` |
| S9 | h22–24 = G2 | Autonomous zero-click retune | End-to-end test: delta → decision → recompileAndShip → tx hashes; log cites entity ID → merge to `main` | `feat/flavio-agent-ens` → `main` |
| S10 | h28–30 = G3 | Robustness + fuzz | Fuzz through Zod passes; hash chain equality test passes → merge to `main` | `feat/flavio-agent-ens` → `main` |
| S11 | h34–35 | Demo prep assets | Rehearsal runs; fixtures ready | `feat/flavio-agent-ens` |

Feature branch commits continuously; merges to `main` only at checkpoints (Classic-track continuous-commit).

## BLOCKERS / DEPENDENCIES ON OTHERS

**You need:**
- **From Flaviano:** frozen Zod spec v1 + `StrategyDeployed` ABI at **h2** (your parse + verify targets); `slots.json` at **G1** (the agent never hand-counts opcode indices); `programHash()` at **h16** (your `v0.programhash` record); the `dock()`/`ship()` signature (h0) + deployed router address (h18–20) for `recompileAndShip` + live `resolveVerify`.
- **From Pietro:** the deployed subgraph endpoint + first real `Swapped` entity at **h18–20** (your `graphDelta` — the hard G2 gate); the card/SSE contract so your `Rejection` + retune payloads render correctly.

**You owe:**
- **To Flaviano:** the `recompileAndShip()` call signature confirmed at **h0**; the live retune firing through his router by **G2**.
- **To Pietro:** the typed `Rejection` + diff payload + retune event stream (entity ID, delta, decision, tx hash) at **h22–24** (his red card + retune badge); the ENS-resolution client for `EnsDiscovery` at h20–22.

## Dealbreaker
**The program-hash chain with the negative path live** (compiler-emitted keccak == ENS `v0.programhash` == recomputed on-chain hash; settle **aborts on mismatch** in front of the judge — no hard-coded values) **AND the autonomous zero-click retune whose decision provably derives from a live subgraph entity delta** (log cites the entity ID). Plus: **you are at the ENS booth Sunday morning — mandatory for both ENS tracks; missing it forfeits $3k of auto-entered prizes regardless of code quality.**

## Scope-cut floor
`resolveVerify` (hash-verify + negative path) + `register.ts` + `graphDelta` poll + `recompileAndShip()` + the retune evidence log. Droppable in order: Studio insurance → x402 → ENSIP-26 JSON records richness → fuzz coverage. **The hash-verify and the zero-click retune are never cut** (G2 rules).

## Demo / Q&A role
Narrate the agent's reasoning (Beat A parse → safety card → ship) and the autonomous retune (Beat C). Q&A owner for: "is The Graph load-bearing?" (answer with the retune evidence log — query, entity ID, decision, tx hash; "unplug the subgraph and the position stops adapting"), "what stops the agent deploying something harmful?" (LLM freedom only inside Zod bounds; everything downstream — Flaviano's compiler — is deterministic), and ENSIP-25/26 (say **"draft standard"**). Sunday: **ENS booth, in person, morning — you are the mandatory attendee.**
