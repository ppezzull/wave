# SwapVM Internals — How to Add a Custom Opcode

_Source: `1inch/swap-vm` @ release/1.1 + `1inch/swap-vm-template`._

## TL;DR

**Adding a custom instruction is subclass-and-append, not a fork.** The opcode table is a `virtual` function (`_opcodes()`) returning an array of internal function pointers. We inherit `AquaOpcodes`, add our instruction contract, override `_opcodes()` to append our functions at the end, wrap it in a router, deploy. Estimated effort once fluent: **hours, not days.**

## Dispatch mechanism (`src/libs/VM.sol`)

```solidity
// runLoop core: [opcode:1 byte][argsLength:1 byte][args:N bytes] per instruction
uint256 opcode = uint8(programBytes[pc++]);
uint256 argsLength = uint8(programBytes[pc++]);
bytes calldata args = programBytes[pc:nextPC];
ctx.vm.opcodes[opcode](ctx, args);   // jump-table of internal fn pointers — no external calls
```

- `Context` = `VM` state (`isStaticContext`, `nextPC`, program ptr, takerArgs ptr, opcode table) + read-only `SwapQuery` (`orderHash, maker, taker, tokenIn, tokenOut, isExactIn`) + mutable `SwapRegisters` (`balanceIn, balanceOut, amountIn, amountOut, amountNetPulled`).
- Instructions can consume **taker args** at runtime via `ctx.tryChopTakerArgs(len)` (dynamic per-swap input, separate from strategy params!).
- Program size limit 65,535 bytes (jumps use uint16 addressing).
- Instruction signature: `function _myOp(Context memory ctx, bytes calldata args) internal` — mutate `ctx.swap` registers, call `ctx.runLoop()` for wrapping semantics, or `ctx.setNextPC()` for control flow.

## The two opcode tables (`src/opcodes/`)

- **`Opcodes.sol`** — full standalone set. **`AquaOpcodes.sol`** — Aqua-backed subset (Controls, XYCSwap, XYCConcentrate, Decay, Fee, PeggedSwap, Extruction) with `_notInstruction` gap slots reserving indices for future additions.
- Both build a static memory array of function pointers; an assembly trick sacrifices slot 0 as the dynamic-array length, so **effective opcode index = position − 1**. Don't hand-count indices — see ProgramBuilder below.
- Table layout is append-only for backward compat ("Add new instructions here" comments mark the spot).
- Indices 0–9 reserved for Debug (see `Debug.sol`, `OpcodesDebug.sol` — debug variants of the tables exist for development).

## Release/1.1 instruction inventory — BIGGER than the whitepaper

Beyond the whitepaper v1.0 set, `src/instructions/` contains: **`Balances`** (`_staticBalancesXD`/`_dynamicBalancesXD`), **`Invalidators`** (bit/token-based order invalidation), **`LimitSwap`** (partial + fill-or-kill), **`MinRate`** (`_requireMinRate1D` guard + `_adjustMinRate1D` clamp), **`DutchAuction`** (balance-in/out time decay), **`BaseFeeAdjuster`** (gas-price-reactive pricing!), **`TWAPSwap`**, **`FeeExperimental`** (progressive fees in/out, amountOut-side protocol fees), and **`OraclePriceAdjuster`** ⚠️.

### ⚠️ `OraclePriceAdjuster.sol` — exists but is wired into NEITHER table
- Chainlink-based (`IPriceOracle` = AggregatorV3-style, staleness check, decimals normalization). Adjusts executed price **toward the oracle, only in the taker's favor**, capped by `maxPriceDecay`; 1D (token1→token0) only; must run **after** a swap instruction sets amounts.
- **Impact on the plan:** "oracle-aware pricing" exists in-repo but unshipped. Our `_oracleGuard2D` must be clearly differentiated — and honestly, it is: ours is **maker protection** (halt/widen quoting when pool-implied price deviates from oracle — the circuit breaker for agent-shipped strategies), the opposite direction. In the demo/Q&A: cite OraclePriceAdjuster as prior art we studied, explain the gap we fill. Bonus flex: also wire *their* unshipped instruction into our custom table.

### `MinRate.sol` is our template for guard-style wrapping instructions
`_requireMinRate1D`: parse packed args → assert pre-conditions → `ctx.runLoop()` (execute inner program) → assert post-condition (cross-multiplication rate check, no division). Copy this structure for `_oracleGuard2D`. Every instruction ships an **`ArgsBuilder` library** (packed `abi.encodePacked` build + offset-sliced parse with typed errors) — copy that pattern too.

## The extension recipe

1. **Instruction contract** — e.g. `contracts/InventorySkew.sol`: `InventorySkewArgsBuilder` lib (build/parse packed params: target ratio, max skew bps) + `contract InventorySkew { function _inventorySkew2D(Context memory, bytes calldata) internal { … } }`.
2. **Extended table** — `contract StrategyOpcodes is AquaOpcodes, InventorySkew, OracleGuard { function _opcodes() internal pure override returns (…) { /* copy AquaOpcodes array, append ours at the end */ } }`.
3. **Router** — mirror `AquaSwapVMRouter` (16 lines!): `contract StrategyRouter is Simulator, SwapVM, StrategyOpcodes { function _instructions() internal pure override returns (…) { return _opcodes(); } }` with constructor `(aqua, weth, owner, name, version)`. `SwapVM` is abstract with `quote()` (line 111) and `swap()` (line 156); `Simulator` mixin gives simulation support.
4. **Program building** — use the **Solidity ProgramBuilder** (`@1inch/swap-vm/test/utils/ProgramBuilder.sol`): `program.build(_inventorySkew2D, args)` resolves the opcode index **from the function pointer** — index-safe, no hand-counted opcodes. (The template's TS ProgramBuilder is just a hex concatenator with raw numeric opcodes — avoid for custom opcodes.) Pattern per `AquaAMM.buildProgram()`: conditional `bytes.concat` of instructions in canonical order → `MakerTraitsLib.build(...)` with `useAquaInsteadOfSignature: true` → returns `ISwapVM.Order`.
5. **E2E flow** (from `AquaAMM.test.ts`): maker `aqua.ship(routerAddress, strategy, tokens, amounts)` → taker `approve(router)` → `router.swap(...)` (**works with plain EOA takers** — MockTaker/resolver optional) → assert transfers. `quote()` for pre-ship simulation.

## More extension surfaces (optional flex)

- **Maker hooks:** `MakerTraits` supports pre/post transfer-in/out hooks (`IMakerHooks`, see `MakerHooks.t.sol`) — e.g. notify our agent on every fill (live dashboard trigger).
- **Taker args:** dynamic per-swap inputs via `tryChopTakerArgs` — opcodes can react to taker-supplied data.
- 40+ Foundry test files in `swap-vm/test/` are the best learning corpus: `Decay.t.sol`, `DynamicProtocolFee.t.sol`, `MakerHooks.t.sol`, `RunLoop.t.sol`, `FeeIndifferencyToSwap.t.sol` (invariant-style tests to imitate for our opcodes).

## Watch items

- **License:** `LicenseRef-Degensoft-SwapVM-1.1` (© 2025 Degensoft Ltd) — custom license, not MIT. Prize rules explicitly allow modified redeployment for the hackathon; review the SwapVM 1.1 license file before any post-hackathon plans.
- swap-vm proper is **Foundry** (Solidity 0.8.30); the template is **Hardhat+TS**. Plan: do contract work Foundry-side (faster tests), keep template only as an integration reference.
