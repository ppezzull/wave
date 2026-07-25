# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

**wave** — a social market for natural-language on-chain strategies, built on 1inch **SwapVM**. An **ETHGlobal Lisboa 2026** hackathon workspace (Classic "from scratch" track). The Solidity protocol lives in `srcs/requirements/swap-vm/`; `docs/` holds sponsor research; `docs/review/` holds AI-assisted prep analysis.

- **Core stack chosen:** 1inch SwapVM/Aqua (P0), The Graph (data), ENS (identity).
- **Event:** build starts Fri Jul 24 2026, submission Sun Jul 26 09:00 WEST.

## ⚠️ Classic Track compliance — the sharpest risk

This repo vendors **1inch upstream** (legal: public open-source library). Everything we author on top must be **written from scratch during the event**, not copied from any prep spike. That posture is unchanged.

**The spike list that used to live here has been removed — it was wrong in both directions.** It named five files as team-authored spikes present in the tree and requiring `git rm`:

| File | Reality |
|---|---|
| `src/instructions/SpikeSkew.sol` | absent — never reached this repo |
| `src/opcodes/StrategyOpcodes.sol` | absent — never reached this repo |
| `src/routers/StrategyRouter.sol` | absent — never reached this repo |
| `test/SpikeStrategy.t.sol` | absent — never reached this repo |
| `test/base/AquaStrategyBuilders.sol` | ⚠️ **upstream, and missing — must be ADDED, not deleted** |

Verified three ways for the first four: `find` across the worktree, absence of any `swap-vm/` duplicate at repo root, and `git log --all` showing no history for those paths. They describe a different working copy.

⚠️ **The fifth is the opposite problem and it blocks the whole build.** `test/base/AquaStrategyBuilders.sol` is **1inch upstream code that the vendoring commit (`99d2144`) dropped**, not a spike of ours. Proof: its only consumer, `test/base/AquaSwapVMTest.sol`, carries the `LicenseRef-Degensoft-SwapVM-1.1` header and `© 2025 Degensoft Ltd` copyright, and declares `contract AquaSwapVMTest is AquaStrategyBuilders`.

```
Error (6275): Source "test/base/AquaStrategyBuilders.sol" not found
  --> test/base/AquaSwapVMTest.sol:19
```

`forge build` fails outright — not just that test. Six upstream Aqua test files depend on `AquaSwapVMTest` (`SwapVMAqua.t.sol`, `XYCSwapAqua.t.sol`, `FeeAqua.t.sol`, `ProtocolFeeAqua.t.sol`, `ControlsAqua.t.sol`, `TakerCallbackAquaNegative.t.sol`) — i.e. exactly the corpus that exercises the Aqua path the 1inch bounty is judged on. **Re-vendor the file from upstream; deleting it is backwards.**

Also required before any build: `npm install` inside `srcs/requirements/swap-vm/` — the Foundry remappings resolve through `node_modules/`, and without it every import fails.

## Working directory

All Foundry/contract commands run **from `srcs/requirements/swap-vm/`**, not the repo root. Dependencies are npm-managed (`package.json` + `node_modules`), not git submodules — install with `npm install` (or `yarn`), not `forge install` alone. Remappings (`srcs/requirements/swap-vm/remappings.txt`) map `forge-std/`, `@openzeppelin/contracts/`, `@1inch/solidity-utils/`, `@1inch/aqua/` into `node_modules/`.

## Git workflow

**When on `main`: always `git pull --rebase` immediately before `git push`** (and before committing if unsure of remote state). This is a shared branch the whole team pushes to — pulling first avoids forced pushes and divergent histories. Commit or push only when the user asks.

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

`docs/strategy/` holds the build docs, one job each:

| Doc | Job |
|---|---|
| [10-10-PLAYBOOK.md](./docs/strategy/10-10-PLAYBOOK.md) | **THE BUILD PLAN** — finalist reframe, opcode/compiler spec §1.5, 5 moves, 36h Gantt |
| [TECH-STACK.md](./docs/strategy/TECH-STACK.md) | the stack |
| [PITCH.md](./docs/strategy/PITCH.md) | demo + Q&A + sponsor lenses |
| [EVENT-RUNBOOK.md](./docs/strategy/EVENT-RUNBOOK.md) | 36h ops + submission checklist |
| [IDEAS.md](./docs/strategy/IDEAS.md) | why this idea |
| [COUNCIL-VERDICT.md](./docs/strategy/COUNCIL-VERDICT.md) | decision record |

> `docs/review/SUMMARY.md` — verified review of the prep analysis: flags that the spike code-review's "CRITICAL C2" is a **demonstrable false positive** (do not add `vm.snapshot`), and that the "heal-side discount" demo beat is weakly supported by the empirics data. Read before acting on any `docs/review/review/SPIKES-REVIEW.md` finding.

## MCP Servers — the `docs` server

The `docs` MCP server (`@modelcontextprotocol/server-filesystem`, configured in `.mcp.json` — copy `.mcp.example.json` to start it) exposes read-only filesystem tools over `docs/`, `CLAUDE.md`, and `README.md`. It's wired in this session as the `mcp__docs__*` tools: `read_text_file`, `read_multiple_files`, `directory_tree`, `search_files`, `list_directory`, `get_file_info`.

**Ground-truth-first rule.** `docs/` is the source of truth for every build decision — the playbook, the stack, the sponsor research, the spike review, the per-person task sheets. **Before you implement anything, ground yourself in the docs first.** Concretely:

- When a task touches the build plan, the spec (opcode/compiler), the demo beats, or the task assignments, **read the relevant doc via the `docs` MCP before writing code** — don't implement from memory or from a stale summary. The strategy moved fast and the CLAUDE.md map above is intentionally lossy; the docs are authoritative.
- When you're about to claim "the plan says X" or "this opcode should do Y," cite the doc (path + section) you read it from. If you can't, go read it first.
- Prefer `mcp__docs__search_files` / `directory_tree` to locate the right doc, then `read_text_file` to read it — rather than guessing at file paths or relying on what's already in context.
- If the docs and the code disagree, surface it (don't silently pick one). Classic-track compliance and the spike-review false positives live in `docs/`, so getting the docs right is getting the build right.

The `docs` server only *advertises* `docs/`, `CLAUDE.md`, `README.md` as resources; the whole repo tree is technically reachable but treat the docs as the grounding surface.

## PRs & issues — caveman style

Keep contributions dead simple. One idea per PR. No big-bang merges, no drive-by rewrites.

- **One thing per PR.** Title = what it does, plain words. `Add docs MCP server` good. `Refactor everything and also fix tests` bad.
- **Branch + PR, not direct push to `main`.** Create a short-lived branch, push, open a PR. Merge from the PR.
- **Title: simple, what a human would search for.** Body: 2–4 lines of *why* and *what changed*, a short bullet list. Skip ceremony.
- **Pull before push** on `main` (`git pull --rebase`) — it's shared. Better: don't touch `main` directly, use a PR.
- **Issues:** if it's worth tracking, write it as one sentence + one sentence of context. Title-first. No templates, no walls of YAML.
- Small, reviewable, mergeable > clever and giant. If a PR needs a table of contents, split it.
