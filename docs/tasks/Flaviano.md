# Flaviano — Compiler + Executer + Settler (P1)

## Mission
Own the **full deterministic spine**: the TS compiler (NL→Zod→AST→IR→bytecode, reject-and-rewrite), the two SwapVM opcodes (`_inventorySkew2D`, `_oracleGuard2D`), `StrategyRouter`, Aqua settlement, and the fork deploy. Everything between *"an AI said something"* and *"safe bytecode settled on-chain"* is yours. Because you own **both** the compiler and the VM it targets, the old slot-drift class (emit ↔ opcode-table desync across two people) is eliminated — it's one person now. Your work wins the **1inch Aqua App ($5k, 1st $2.5k)** and carries finalist **Technicality + Practicality + Originality**.

> **Your spine contract = [10-10-PLAYBOOK.md](../strategy/10-10-PLAYBOOK.md) §1.5** (opcode/compiler spec). The compiler's emit and the VM's opcode table are *yours to keep in sync* — `slots.json` is now a self-check, not a cross-person handshake.

## Hour-by-hour

**h0–2 — `ast.ts` + Zod freeze + `EnsStrategyRouter` skeleton 🔴 (spine root)**
- `srcs/requirements/compiler/src/ast.ts`: typed AST for the 9 block types + Zod-bounded DSL (bounded numerics, unknown types rejected, `feed` resolves via a compiler-owned Chainlink symbol registry — the LLM never emits an address). **Freeze as `specVersion: 1` at h2** — after h2, changes are additive-with-default only. Publish to Flavio (agent parse target) + Pietro (UI fixtures).
- `srcs/requirements/swap-vm/src/routers/EnsStrategyRouter.sol` (fresh — do NOT copy the spike `StrategyRouter.sol`): Simulator + SwapVM + Aqua opcode table; post-ship hook emits **`StrategyDeployed(strategyId, programHash, ensNode)`** — freeze this signature NOW + export ABI JSON. Flavio targets it in `resolveVerify`; Pietro's subgraph maps it.
- Serves: G1; spine origin. Unblocks Flavio's ENS verify + Pietro's subgraph.

**h2–4 — compliance + canonical ordering**
- **h4 hard stop: `git rm` the 5 spike files** (`SpikeSkew.sol`, `StrategyOpcodes.sol`, `StrategyRouter.sol`, `SpikeStrategy.t.sol`, `AquaStrategyBuilders.sol`) in a commit that **precedes any rewrite** — Classic-track proof. Also delete the untracked `swap-vm/` duplicate at repo root.
- `srcs/requirements/compiler/src/canonical.ts`: enforce `Deadline → Concentrate → Decay → OracleGuard → InventorySkew → MakerFee → ProtocolFee → Curve → Salt`; produce the AST move-arrow + unified diff for an unsafe order (the WOW beat's raw material — Pietro's card consumes it).

**h8–10 — clean opcode rewrite + rules stubs (the spine's load-bearing hours)**
- `srcs/requirements/swap-vm/src/instructions/InventorySkew.sol` + `OracleGuard.sol`, from the §1.5 spec, not spike code. Guard is `internal view` (works under `quote()`/`asView`), **staleness check is the first branch and always reverts** (both modes). Skew: post-trade deviation, penalty floor-rounded, exactOut mirrors with `ceilDiv`. New opcode table appends both at the END (slot 0 reserved; append-only). SPDX `LicenseRef-Degensoft-SwapVM-1.1` headers on every new `.sol`.
- `srcs/requirements/compiler/src/rules.ts` as **rules-as-data** (`{predicate, message, rewrite}`): stub all 6, implement the two demo-critical first (`OracleGuardMustPrecedeSkew`, `ProtocolFeeLeMakerFee`).
- Serves: G1. Unblocks the safety-card battery + the mutation fuzz.

**h10–12 — stale-halt + clamp tests + IR/emit**
- `srcs/requirements/swap-vm/test/mocks/MockOracle.sol` (in `test/mocks/`, never inline), `test/invariants/OracleGuardStaleHalt.t.sol` + `OracleGuardClamp.t.sol` (band containment, clamp monotonic at the kink, rounding favors maker). Exact selectors in every `vm.expectRevert`.
- `srcs/requirements/compiler/src/ir.ts` + `emit.ts`: `[opcode:1][argsLength:1][args]` per instruction, byte-identical, deterministic (canonical serialization — property test: same spec byte-identical across runs incl. JSON key-order shuffles). **TS-direct emit is PRIMARY; on-chain `StrategyFactory` demoted to post-G2 stretch.**

**h12 = G1 🟢 — `slots.json` self-check**
- Forge script dumps the opcode-index map from your function-pointer array → commit `slots.json` + snapshot tests on **both** the Solidity side and the TS compiler side (they're both yours — drift fails loudly here, not at G2). Gate bar: clean opcodes compile, stale-halt/clamp green, canonical reorder visibly fixes an unsafe order.
- If missed: runbook cut — keep `OracleGuardStaleHalt` + band-containment, drop kink-monotonicity; `canonical.ts` + rules 1&2 + TS-direct emit only.

**h14–16 — byte-identical emit + disassembler + liveness/additivity**
- `InventorySkewLiveness.t.sol` (penalty cap < 100% ⇒ never bricks) + `InventorySkewAdditivity.t.sol` (subadditive-or-equal over a size grid; empirics 2026-07-20 confirmed subadditive).
- **Disassembler + round-trip test** (`decode(emit(ir)) === ir`) — hand the decoder to Pietro (his bytecode pane + the "is it really a compiler?" Q&A armor).
- `programHash()` = keccak256 of emitted bytes → wire into the ship path/`StrategyDeployed` event. **Hand to Flavio** (his hash-verify input).

**h16–18 — `graph deploy` lands (you own fork infra)**
- Take Pietro's h16 `schema.graphql`/`mapping.ts`/`subgraph.yaml` handoff; deploy router to the anvil fork via `make deploy-swap-vm-aqua`; land `graph deploy` against Pietro's graph-node; fire a fixture swap; **verify a real `Swapped` entity is queryable; hand Flavio + Pietro the endpoint URL.**

**h18–20 — mutation harness + Beat-B arming**
- One-command mutation switch: `MUTATION=M1|M2|M3 forge test` via env/profile (M1 drops staleness revert, M2 flips clamp direction, M3 penalty >1). Capture RED runs.
- Hand Pietro the deployed `MockAggregatorV3` + control script (deviate/restore) for the judge-triggered revert. *Beat-B arming does not slide; the mutation harness can slide post-G2 if you're slipping.*

**h20–24 = G2 🟢 — end-to-end retune support + swap-trace artifact**
- Pair with Flavio until the autonomous retune fires zero-click through your router (Flavio's `graphDelta` → his `recompileAndShip()` → your `dock()`/`ship()`). Compliance heartbeat h24: re-read the 5 deleted spike files vs your rewrites — confirm zero copy.
- Commit the **swap-trace artifact**: one full trace showing `IAqua` pull/push + both opcodes + `Swapped` (the 1inch judge's 30-second proof).

**h28–30 → G3 (h30) 🟢 — hardening, then freeze**
- Gas snapshot within 5% tolerance, quote==swap consistency test, `forge test` clean on `ci` profile. Freeze at h30.

**h34–35 — demo proof + fork drill**
- Record the RED/GREEN mutation split-screen. Rehearse the T-15min fresh-fork cut (read Chainlink `updatedAt` at cut) and the backup-anvil RPC swap (≤15s).

## Definition of Done — checks & tests per step

| Step (hours) | What "done" looks like — checks & tests |
|--------------|-----------------------------------------|
| **h0–2** | `tsc --noEmit` passes on `srcs/requirements/compiler/src/ast.ts`; `StrategyDeployed(strategyId, programHash, ensNode)` event signature frozen in `EnsStrategyRouter.sol`; ABI JSON exported to `docs/abi/` by h2; Zod spec version 1 frozen with `specVersion: 1` in published output. |
| **h2–4** | `git log --oneline --all | grep -E "(git rm|delete spike)"` confirms deletion commit exists and precedes any rewrite commits; `git ls-files` shows 0 of the 5 spike files remain; `srcs/requirements/swap-vm/src/routers/StrategyRouter.sol` is NOT present; `tsc --noEmit` passes on `canonical.ts`. |
| **h8–10** | `forge build` passes from `srcs/requirements/swap-vm/`; `forge fmt --check` passes on all new `.sol` files; SPDX headers `LicenseRef-Degensoft-SwapVM-1.1` present on `InventorySkew.sol` and `OracleGuard.sol`; `tsc --noEmit` passes on `rules.ts` stubs; opcode table appended at END (slot 0 reserved). |
| **h10–12** | `forge test --match-test OracleGuardStaleHalt -vvv` passes (staleness revert in both quote/swap); `forge test --match-test OracleGuardClamp -vvv` passes (band containment + kink monotonicity); `MockOracle.sol` exists in `test/mocks/` (not inline); `vm.expectRevert()` uses exact selectors; `tsc --noEmit` passes on `ir.ts` and `emit.ts`. |
| **h12 = G1** | `slots.json` committed with opcode-index map; `forge test` clean on `ci` profile; `forge snapshot --check --tolerance 5 --no-match-test "testFuzz_*"` passes; property test `decode(emit(ir)) === ir` round-trip passes; same-spec byte-identical emit across JSON key-order shuffles passes. |
| **h14–16** | `forge test --match-test InventorySkewLiveness -vvv` passes (penalty cap < 100%); `forge test --match-test InventorySkewAdditivity -vvv` passes (subadditive-or-equal over size grid); `programHash()` = keccak256(emitted bytes) test passes; disassembler round-trip test passes; decoder source handed to Pietro. |
| **h16–18** | `make deploy-swap-vm-aqua` succeeds; router address persisted to `config/constants.json`; `graph deploy` succeeds against Pietro's graph-node; fixture swap fired; `Swapped` entity queryable at subgraph endpoint (curl returns non-empty); endpoint URL handed to Flavio + Pietro. |
| **h18–20** | `MUTATION=M1 forge test` captures RED (staleness revert dropped); `MUTATION=M2 forge test` captures RED (clamp direction flipped); `MUTATION=M3 forge test` captures RED (penalty > 1); `MockAggregatorV3` deployed; control script for deviation/restore handed to Pietro. |
| **h20–24 = G2** | Autonomous retune fires zero-click (Flavio's `graphDelta` → `recompileAndShip()` → your `dock()`/`ship()`); `git diff` confirms 0 lines copied from deleted spike files to rewrites; swap-trace artifact shows `IAqua.pull()`, `IAqua.push()`, `_inventorySkew2D`, `_oracleGuard2D`, and `Swapped` event in one trace. |
| **h28–30 → G3** | `forge snapshot --check --tolerance 5 --no-match-test "testFuzz_*"` passes; `forge test --match-test QuoteSwapConsistency -vvv` passes (quote-hash == swap-hash); `forge test` clean on `ci` profile; `forge fmt --check` passes; freeze commit tagged at h30. |
| **h34–35** | RED/GREEN mutation screenshots recorded; fresh-fork cut rehearsal ≤15s; backup-anvil RPC swap ≤15s; demo runbook checked; `updatedAt` read verified at cut time. |

## Step-by-step build ladder & merge points

| Step | Hours | What ships | DoD check (gates it) | Branch → merge point |
|------|-------|------------|---------------------|----------------------|
| **S1** | h0–2 | `ast.ts` with Zod-bounded DSL + `EnsStrategyRouter.sol` skeleton + `StrategyDeployed` event + ABI export | `tsc --noEmit`, event frozen, ABI exported | `feat/flaviano-spine` (start) |
| **S2** | h2–4 | Spike deletion commit + `canonical.ts` ordering enforcement | Deletion commit precedes rewrites (git log), `tsc --noEmit` | `feat/flaviano-spine` |
| **S3** | h8–10 | `InventorySkew.sol` + `OracleGuard.sol` (clean rewrite) + opcode table append + `rules.ts` stubs | `forge build`, SPDX headers, `forge fmt --check`, `tsc --noEmit` | `feat/flaviano-spine` |
| **S4** | h10–12 | `OracleGuardStaleHalt.t.sol` + `OracleGuardClamp.t.sol` + `ir.ts` + `emit.ts` | `forge test --match-test OracleGuard*`, exact selectors, `tsc --noEmit` | `feat/flaviano-spine` |
| **S5** | **h12 = G1** 🟢 | `slots.json` commit + snapshot tests + property tests (round-trip, byte-identical) | `slots.json` committed, `forge snapshot --check`, property tests pass | **→ merge to `main` (G1 checkpoint)** |
| **S6** | h14–16 | `InventorySkewLiveness.t.sol` + `InventorySkewAdditivity.t.sol` + disassembler + `programHash()` | Liveness/additivity tests pass, round-trip test passes, hash test passes | `feat/flaviano-spine` |
| **S7** | h16–18 | Fork deploy (`make deploy-swap-vm-aqua`) + `graph deploy` + live `Swapped` entity query | Deploy succeeds, `graph deploy` succeeds, `Swapped` query returns data | `feat/flaviano-spine` |
| **S8** | h18–20 | Mutation harness (`MUTATION=M1|M2|M3`) + `MockAggregatorV3` + control script | M1/M2/M3 capture RED, mock deployed, script handed to Pietro | `feat/flaviano-spine` |
| **S9** | **h20–24 = G2** 🟢 | End-to-end retune (zero-click) + swap-trace artifact + compliance re-check | Retune fires, swap-trace shows full flow, `git diff` confirms 0 spike copy | **→ merge to `main` (G2 checkpoint)** |
| **S10** | h28–30 → G3 🟢 | Hardening (gas snapshot, quote==swap consistency, full test suite) + freeze | `forge snapshot --check`, quote/swap test, `forge test` clean, freeze tag | **→ merge to `main` (G3 freeze)** |
| **S11** | h34–35 | Demo proof (screenshots) + fork drill rehearsal | RED/GREEN screenshots, fork cut ≤15s, RPC swap ≤15s | `feat/flaviano-spine` (final) |

Feature branch commits continuously; merges to `main` only at checkpoint sync points (Classic-track continuous-commit).

## BLOCKERS / DEPENDENCIES ON OTHERS

**You need:**
- **From Flavio:** the agentic `recompileAndShip()` call into your `dock()`/`ship()` (h20) — confirm the signature at h0.
- **From Pietro:** `schema.graphql` + `mapping.ts` + `subgraph.yaml` by **h16** (your `graph deploy`); running graph-node from his h2–4 spike (your deploy target).

**You owe:**
- **To Flavio:** frozen Zod spec v1 + `StrategyDeployed` ABI at **h2**; `slots.json` at **G1**; `programHash()` at **h16**; deployed subgraph endpoint at **h18–20**.
- **To Pietro:** the disassembler decoder at **h14–16** (his bytecode pane); live `_oracleGuard2D` + MockAggregator control at **h20–22** (his Beat B); fork/RPC babysitting during the demo.

## Dealbreaker
**The live `swap()` through Aqua** — pull/push visible in the trace, `Swapped` in fork logs, both opcodes in the hot path — plus a working `_oracleGuard2D` halt and a byte-identical compiler emit. Absent Sunday: 1inch is gone and the finalist Practicality/WOW beats have no engine. Never cut.

## Scope-cut floor
`canonical.ts` + rules 1&2 + TS-direct emit + `OracleGuardStaleHalt` + `OracleGuardClamp` (band containment) + M1/M2 env-toggles + one RED screenshot. Skew keeps penalty path only (drop `maxImproveBps`). The live `swap()`, the halt, and byte-identical emit are never on the cut list.

## Demo / Q&A role
Drive the fork: T-15 fresh cut, live `swap()` at Beat A's close, RPC swap on Beat-B failure while Pietro narrates. Q&A owner for: opcode math and maker-favored rounding (exactIn floors, exactOut `ceilDiv`), "why a native opcode instead of `_extruction`?" (cite `Extruction.sol`'s own header warning — never say "impossible"), "is it really a compiler?" (determinism + disassembler round-trip + typed total verdicts — show the property tests), and license compliance. Sunday: **finalist judging session** (with Pietro); you cut the fresh fork at T-15.
