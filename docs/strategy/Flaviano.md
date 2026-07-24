# Flaviano — 1inch / Solidity core (P1)

## Mission
Own the on-chain core: the two custom opcodes (`_inventorySkew2D`, `_oracleGuard2D`), the mutation-killed invariant suite, `EnsStrategyRouter`, fork deploy, and the Solidity half of Move 5 (post-ship hook + subgraph deploy). Your work wins **1inch Aqua App ($2,500 1st, of the $5,000 pool)** and carries the finalist **Technicality + Practicality** criteria. You are the root of the Oracle-Guard Spine: everything Flavio and Pietro ship downstream hangs off your h0–20 output.

## Hour-by-hour

**h0–2 — `EnsStrategyRouter` skeleton + frozen event 🔴 (spine root)**
- Write `srcs/requirements/swap-vm/src/routers/EnsStrategyRouter.sol` from scratch (Simulator + SwapVM + Aqua opcode table for now). Post-ship hook emits **`StrategyDeployed(strategyId, programHash, ensNode)`** — freeze this signature NOW and export the ABI JSON. Hash-match test stub.
- Serves: G1. Unblocks: Flavio's `resolveVerify` target, Pietro's `subgraph.yaml`/mapping.

**h2–4 — compliance + arg-layout sync**
- Confirm the Classic-track licensing posture: every new `.sol` carries the `LicenseRef-Degensoft-SwapVM-1.1` header + `@custom:license-url`, and all router/opcode/instruction code is written from scratch during the event.
- Read Flavio's frozen Zod spec v1; align your planned ArgsBuilder byte layouts to it.

**h8–10 — clean opcode rewrite (the spine's load-bearing hours)**
- `srcs/requirements/swap-vm/src/instructions/InventorySkew.sol` + `OracleGuard.sol`, implemented from scratch per the spec. Guard is `internal view` (works under `quote()`/`asView`), **staleness check is the first branch and always reverts** (both modes). Skew: post-trade deviation, penalty floor-rounded, exactOut mirrors with `ceilDiv`. New opcode table appends both at the END (slot 0 reserved; append-only).
- SPDX `LicenseRef-Degensoft-SwapVM-1.1` headers + `@custom:license-url` on every new `.sol` (h8 heartbeat).
- Serves: G1. Unblocks: Flavio's IR/emit semantics, the safety-card battery, Move-2 fuzz.

**h10–12 — stale-halt + clamp tests**
- `srcs/requirements/swap-vm/test/mocks/MockOracle.sol` (add to `test/mocks/`, never inline), `test/invariants/OracleGuardStaleHalt.t.sol` + `OracleGuardClamp.t.sol` (band containment, clamp monotonic at the kink, rounding favors maker). Exact selectors in every `vm.expectRevert`.

**h12 = G1 🟢 — `slots.json` handshake**
- Forge script dumps the opcode-index map from the function-pointer array → commit `slots.json` + a Solidity-side snapshot test. **Table is append-only after this; any append = announced handshake + regenerated file.** Gate bar: clean opcodes compile, stale-halt/clamp green.
- If missed: runbook cut — keep `OracleGuardStaleHalt` + band-containment, drop kink-monotonicity.

**h14–16 — liveness + additivity invariants**
- `InventorySkewLiveness.t.sol` (penalty cap < 100% ⇒ never bricks) + `InventorySkewAdditivity.t.sol` (subadditive-or-equal over a size grid, mirroring `FeeIndifferencyToSwap.t.sol`). `test/base/StrategyInvariantBuilders.sol`.

**h16–18 — receive Pietro's subgraph files; wire `programHash`**
- Take Flavio's h16 `programHash()` into the ship path so `StrategyDeployed` carries the real keccak. Review Pietro's `schema.graphql`/`mapping.ts` handoff against your ABI.

**h18–20 — `graph deploy` lands (you own fork infra)**
- Deploy router to the anvil fork via `make deploy-swap-vm-aqua` targets; land `graph deploy` against Pietro's h2–4 graph-node; fire a fixture swap; **verify a real `Swapped` entity is queryable; hand Pietro the endpoint URL.**
- Serves: G2 spine. Unblocks: Pietro's `graphDelta` (h20–22).

**h20–22 — mutation harness + Beat-B arming**
- One-command mutation switch: `MUTATION=M1|M2|M3 forge test` via env/profile — M1 drops staleness revert, M2 flips clamp direction, M3 penalty >1. Capture RED runs.
- Hand Pietro the deployed `MockAggregatorV3` + a control script (deviate/restore) for the judge-triggered revert. *If you're slipping, the mutation harness slides post-G2 before anything else of yours does — Beat-B arming does not slide.*

**h22–24 = G2 🟢 — end-to-end retune support**
- Pair with Pietro until the autonomous retune fires zero-click through your router. Compliance heartbeat h24: confirm every new file carries the right license header and is freshly authored for this event.

**h28–30 → G3 (h30) 🟢 — hardening, then freeze**
- Gas snapshot within 5% tolerance (`forge snapshot --check --tolerance 5 --no-match-test "testFuzz_*"`), quote==swap consistency test, `forge test` clean on `ci` profile. Commit the **swap-trace artifact**: one full trace showing `IAqua` pull/push + both opcodes + `Swapped` (the 1inch judge's 30-second proof). Freeze at h30.

**h34–35 — demo proof + fork drill**
- Record the RED/GREEN mutation split-screen. Rehearse the T-15min fresh-fork cut (read Chainlink `updatedAt` at cut) and the backup-anvil RPC swap (≤15s).

## BLOCKERS / DEPENDENCIES ON OTHERS

**You need:**
- **From Flavio:** Zod spec v1 frozen at **h2** (your ArgsBuilder layouts); `programHash()` at **h16** (your ship path/event); the emit byte-stream at h14–16 to cross-check hash equality.
- **From Pietro:** graph-node running from his **h2–4** work (your h18–20 deploy target); `schema.graphql` + `mapping.ts` + `subgraph.yaml` by **h16**; the `make demo-up` script wrapping your deploy targets by G2.

**You owe:**
- **To Flavio:** `StrategyDeployed` ABI at **h2**; locked opcode semantics at **h10**; `slots.json` at **G1** (his emitter consumes it — regenerate ONLY with an announced handshake).
- **To Pietro:** the same ABI at **h2** (his mapping); deployed subgraph endpoint + first `Swapped` entity at **h18–20**; live `_oracleGuard2D` + MockAggregatorV3 control script at **h20–22** (his Beat B); fork/RPC babysitting during the demo.

## Dealbreaker
**The live `swap()` through Aqua** — pull/push visible in the trace, `Swapped` event in fork logs, both opcodes in the hot path — plus a working `_oracleGuard2D` halt. Absent Sunday: 1inch is gone and the finalist Practicality/WOW beats have no engine. Never cut, per G3 rules.

## Scope-cut floor
`OracleGuardStaleHalt` + `OracleGuardClamp` (band containment) + M1/M2 env-toggles + one RED screenshot; skew keeps penalty path only (drop `maxImproveBps` — it never binds; the oracle band is the real bound). The live `swap()` and the halt are never on the cut list.

## Demo / Q&A role
Drive the fork: T-15 fresh cut, live `swap()` at Beat A's close, RPC swap on Beat-B failure while Pietro narrates. Q&A owner for: opcode math and maker-favored rounding (exactIn floors, exactOut `ceilDiv`), "why a native opcode instead of `_extruction`?" (cite `Extruction.sol`'s own header warning — never say "impossible"), and license compliance. Sunday: **finalist judging session** (with Pietro); you cut the fresh fork at T-15.
