# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An **ETHGlobal Lisboa 2026** hackathon workspace (Classic "from scratch" track). The team is building a strategy-compiler on top of 1inch's **SwapVM** — a VM where token-swap orders are bytecode programs. The Solidity protocol lives in `srcs/requirements/swap-vm/`; `docs/` holds sponsor research; `docs/review/` holds AI-assisted prep analysis.

- **Core stack chosen:** 1inch SwapVM/Aqua (P0), The Graph (data), ENS (identity).
- **Event:** build starts Fri Jul 24 2026, submission Sun Jul 26 09:00 WEST.

## ⚠️ Classic Track compliance — the sharpest risk

This repo mixes **forked 1inch upstream** (legal: public open-source library) with **team-authored "spike" code**. The spike contracts are *throwaway prep* that must be **rewritten from scratch during the event**, not copied:

- `srcs/requirements/swap-vm/src/instructions/SpikeSkew.sol`
- `srcs/requirements/swap-vm/src/opcodes/StrategyOpcodes.sol`
- `srcs/requirements/swap-vm/src/routers/StrategyRouter.sol`
- `srcs/requirements/swap-vm/test/SpikeStrategy.t.sol`, `srcs/requirements/swap-vm/test/base/AquaStrategyBuilders.sol`

These live inside the main source tree (not an isolated `spikes/` dir), so a "delete spikes/" cleanup will miss them. They must be `git rm`'d and rewritten during the hackathon. Do not treat the spike design as final.

## Working directory

All Foundry/contract commands run **from `srcs/requirements/swap-vm/`**, not the repo root. Dependencies are npm-managed (`package.json` + `node_modules`), not git submodules — install with `npm install` (or `yarn`), not `forge install` alone. Remappings (`srcs/requirements/swap-vm/remappings.txt`) map `forge-std/`, `@openzeppelin/contracts/`, `@1inch/solidity-utils/`, `@1inch/aqua/` into `node_modules/`.

## Common commands (run in `srcs/requirements/swap-vm/`)

```bash
forge build                              # compile (also: make build)
forge test -vvv --gas-report             # full suite (also: make tests)
forge test --match-test TestName -vvv    # single test
forge test -mc ContractName              # single contract
forge test --match-path "test/gas/*.t.sol" -vv   # gas snapshot suite (make gas-snapshot)
forge snapshot --no-match-test "testFuzz_*"      # gas snapshot (make snapshot)
forge snapshot --check --tolerance 5 --no-match-test "testFuzz_*"   # CI gate
forge fmt                                # format (make format)
forge fmt --check                        # lint (make lint) — CI does NOT run this; it runs snapshot-check + test
forge coverage --report lcov --ir-minimum --report-file coverage/lcov.info   # make coverage
```

CI (`srcs/requirements/swap-vm/.github/workflows/ci.yml`, `FOUNDRY_PROFILE=ci`) only gates on **gas snapshot check (5% tolerance, fuzz excluded)** and **`forge test`**.

Deployment via `make` (see `srcs/requirements/swap-vm/Makefile`, `docs/swap-vm-upstream/DEPLOY.md`): set vars in `.env` (or `.env.automation` under `OPS_LAUNCH_MODE=auto`), then `make deploy-swap-vm | deploy-swap-vm-aqua | deploy-swap-vm-limit`. The Makefile reads `OPS_NETWORK`/`OPS_CHAIN_ID` and derives `<PREFIX>_RPC_URL` / `<PREFIX>_PRIVATE_KEY`, persists addresses to `config/constants.json` and `deployments/<network>/`.

## Build configuration (`srcs/requirements/swap-vm/foundry.toml`)

- Solidity **0.8.30**, optimizer on (`optimizer_runs = 700`), **`via_ir = true`**, custom Yul optimizer steps.
- Two profiles: `default` (local dev) and `ci`.
- `fs_permissions` grants read-write to `./deployments` and `./config` (scripts write deployment artifacts).
- `forge fmt` style: bracket spacing on, long int types, thousands underscores, multi-line function headers. Match it.

## Architecture

**The VM.** `SwapVM` (`src/SwapVM.sol`, abstract) takes a signed maker `Order{ maker, traits, data }` and runs a bytecode "program" extracted via `order.traits.program(order.data)`. Execution is in `ContextLib.runLoop` (`src/libs/VM.sol`): each instruction is encoded as `[opcode:1 byte][argsLength:1 byte][args:argsLength bytes]`; the loop reads the opcode, dispatches into `ctx.vm.opcodes[opcode](ctx, args)`, and advances PC. State lives in the `Context` struct — `VM` (PC, program/takerArgs calldata pointers, opcode table), `SwapQuery` (read-only maker/taker/tokens/isExactIn), and `SwapRegisters` (balanceIn/Out, amountIn/Out, amountNetPulled).

**Entry points** (`quote` / `swap`): build the `Context`, then either execute in static context (`quote`, via `asView()`) or run the full flow (`swap`): signature/Aqua verification → `runLoop` → trait+ taker validation → transfers (in/out, with maker hooks and taker callbacks, Aqua pull/push or plain `safeTransferFrom`, optional WETH unwrap) → emit `Swapped`. Re-entrancy is guarded per-`orderHash` via `TransientLock`. Jump addressing is `uint16` → programs are effectively limited to 65,535 bytes (see `runLoop` natspec).

**Adding an instruction / custom opcode** (the hackathon's core move):
1. Write an `instructions/*.sol` contract with an `internal` function `(Context memory, bytes calldata)`.
2. Build an opcode table: a contract inheriting many instruction contracts and exposing `_opcodes()` returning the function-pointer array. **Append new entries at the end** — opcode indices are positions in this array, so append-only preserves backward compatibility. Slot 0 is reserved (`_notInstruction`).
3. Wire a router that inherits `SwapVM` + the opcode-table contract and overrides `_instructions()` to return `_opcodes()`.

**Layered opcode tables** (`src/opcodes/`): `Opcodes` (base, 47 entries) → `AquaOpcodes`/`LimitOpcodes` (variant sets) → `StrategyOpcodes` (spike: Aqua table + `_spikeSkew2D` appended). Each router (`src/routers/*`) = `Simulator` + `SwapVM` + one opcode table. There are paired `*Debug` variants for tracing.

**Key building blocks:** `src/libs/MakerTraits.sol` + `TakerTraits.sol` (bit-packed flags parsed from calldata, also encode the program pointer and taker args), `AquaOpcodes`/`IAqua` (1inch balance-management protocol that can replace signatures), hooks (`IMakerHooks`/`ITakerCallbacks`).

## Conventions (from `srcs/requirements/swap-vm/.cursor/rules/`)

- **Use 1inch libs over OZ:** `SafeERC20` (exports `IERC20`+`IWETH` — do **not** separately import OZ `IERC20`), `ECDSA`, `TransientLock` (not `ReentrancyGuard`), `OnlyWethReceiver`, `Simulator`, `Calldata`/`CalldataPtrLib`, `TokenMock`. OZ is used only for `EIP712`, `Math`, `SafeCast`.
- **License header** required on every `.sol`: `// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1` plus the `@custom:license-url`/`@custom:copyright` lines (copy from any file in `src/`).
- **Tests** (`srcs/requirements/swap-vm/test/`): never define mock contracts inline — use `TokenMock` or add to `test/mocks/<Name>.sol`. Inherit `AquaSwapVMTest` for Aqua-router tests, `Test` + `OpcodesDebug` for direct tests, `CoreInvariants` for invariant tests. Always specify exact selectors: `vm.expectRevert(Contract.ErrorName.selector)`, never bare `vm.expectRevert()`. When fixing a failing test, make minimal changes — don't rewrite or add new test files/functions unless asked.
- **Math conventions:** exactIn rounds output **down** (maker-favored); exactOut rounds input **up** (`Math.ceilDiv`). Test asymmetric pools and both directions.

## Security & testing bar (from `srcs/requirements/swap-vm/.cursor/rules/` + `TESTING.md`)

Every swap instruction must hold: round-trip (no A→B→A profit), pool-drain (invariant grows), sandwich-resistance, split-swap additivity, overflow safety, boundary smoothness, monotonicity, exactIn/exactOut symmetry, **quote == swap consistency**, and rounding that favors the maker. `TESTING.md` documents which invariant tests carry open TODOs/skips (e.g. progressive fees violate additivity by design; concentrate+decay symmetry is under research) — check it before assuming a green suite means full coverage.

## Context & strategy docs (read before event work)

- `docs/strategy/` holds the build docs, one job each: `10-10-PLAYBOOK.md` (THE BUILD PLAN — finalist reframe, opcode/compiler spec §1.5, 5 moves, 36h Gantt), `PITCH.md` (demo + Q&A + sponsor lenses), `EVENT-RUNBOOK.md` (36h ops + submission checklist), `TECH-STACK.md` (the stack), `IDEAS.md` (why this idea), `COUNCIL-VERDICT.md` (decision record).
- `docs/review/SUMMARY.md` — verified review of the prep analysis: flags that the spike code-review's "CRITICAL C2" is a **demonstrable false positive** (do not add `vm.snapshot`), and that the "heal-side discount" demo beat is weakly supported by the empirics data. Read before acting on any `docs/review/review/SPIKES-REVIEW.md` finding.
