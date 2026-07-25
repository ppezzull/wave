# Flaviano — Compiler + Executer + Settler (P1)

Owns the full deterministic spine: TS compiler → two SwapVM opcodes → `EnsStrategyRouter` → Aqua settlement → fork deploy. Spine contract = [10-10-PLAYBOOK.md](../strategy/10-10-PLAYBOOK.md) §1.5.

| ☐ | Task | Person | Collab |
|---|---|---|---|
| ☐ | `ast.ts` — typed AST for 9 block types + Zod-bounded DSL (`feed` resolves via compiler-owned Chainlink registry; no addresses from the LLM). Freeze as `specVersion: 1` | Flaviano | → Flavio (parse target), Pietro (fixtures) |
| ☐ | `EnsStrategyRouter.sol` (fresh, not spike) — Simulator + SwapVM + Aqua table; post-ship hook emits `StrategyDeployed(strategyId, programHash, ensNode)`. Freeze signature + export ABI JSON | Flaviano | → Flavio (`resolveVerify`), Pietro (subgraph mapping) |
| ☐ | `git rm` the 5 spike files in a commit **preceding** any rewrite (Classic-track proof) + delete untracked `swap-vm/` duplicate | Flaviano | — |
| ☐ | `canonical.ts` — enforce `Deadline→Concentrate→Decay→OracleGuard→InventorySkew→MakerFee→ProtocolFee→Curve→Salt`; produce AST move-arrow + unified diff | Flaviano | → Pietro (WOW card) |
| ☐ | Clean rewrite `InventorySkew.sol` + `OracleGuard.sol` (per §1.5, not spike). Guard = `internal view`, staleness check first branch + always reverts. Append both opcodes at END (slot 0 reserved). SPDX headers on every new `.sol` | Flaviano | — |
| ☐ | `rules.ts` as rules-as-data `{predicate, message, rewrite}`; stub all 6, implement `OracleGuardMustPrecedeSkew` + `ProtocolFeeLeMakerFee` first | Flaviano | — |
| ☐ | `MockOracle.sol` (in `test/mocks/`) + `OracleGuardStaleHalt.t.sol` + `OracleGuardClamp.t.sol` (band containment, kink monotonicity, maker-favored rounding, exact selectors) | Flaviano | — |
| ☐ | `ir.ts` + `emit.ts` — `[opcode:1][argsLength:1][args]`, byte-identical, deterministic. **TS-direct emit is primary; on-chain factory demoted to post-G2 stretch** | Flaviano | — |
| ☐ | `slots.json` self-check — forge script dumps opcode-index map; snapshot tests on both Solidity + TS sides (drift fails here, not G2). **G1 → merge to `main`** | Flaviano | gate |
| ☐ | `InventorySkewLiveness.t.sol` (penalty cap <100%⇒never bricks) + `InventorySkewAdditivity.t.sol` (subadditive-or-equal over size grid) | Flaviano | — |
| ☐ | Disassembler + round-trip test `decode(emit(ir))===ir`; `programHash()` = keccak256 of emitted bytes, wired into ship path/`StrategyDeployed` | Flaviano | → Pietro (bytecode pane), Flavio (hash-verify input) |
| ☐ | Take Pietro's subgraph handoff; `make deploy-swap-vm-aqua` on the fork; `graph deploy` against Pietro's graph-node; fire fixture swap; verify real `Swapped` entity queryable | Flaviano | ← Pietro (schema/mapping); → Flavio + Pietro (endpoint URL) |
| ☐ | Mutation harness `MUTATION=M1|M2|M3 forge test` (M1 drops staleness revert, M2 flips clamp, M3 penalty >1); capture RED | Flaviano | → Pietro (RED/GREEN proof) |
| ☐ | Deploy `MockAggregatorV3` + deviation/restore control script | Flaviano | → Pietro (Beat B arming — does not slide) |
| ☐ | Pair until autonomous retune fires zero-click through router (Flavio `graphDelta`→`recompileAndShip()`→`dock()`/`ship()`); re-read 5 deleted spikes vs rewrites, confirm zero copy. **G2 → merge to `main`** | Flaviano | ← Flavio (retune); gate |
| ☐ | Commit swap-trace artifact: one trace showing `IAqua` pull/push + both opcodes + `Swapped` (1inch 30s proof) | Flaviano | — |
| ☐ | Gas snapshot ≤5%, `quote()==swap()` consistency test, `forge test` clean on `ci` profile. **G3 → freeze + merge to `main`** | Flaviano | gate |
| ☐ | Record RED/GREEN mutation split-screen; rehearse fresh-fork cut (read Chainlink `updatedAt`) + backup-anvil RPC swap (≤15s) | Flaviano | demo with Pietro |

**Never cut:** the live `swap()` through Aqua, the `_oracleGuard2D` halt, byte-identical compiler emit.
**Cut floor:** `canonical.ts` + rules 1&2 + TS-direct emit + `OracleGuardStaleHalt`/`Clamp` + M1/M2 toggles + one RED screenshot; skew keeps penalty path only.
