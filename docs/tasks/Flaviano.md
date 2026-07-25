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
