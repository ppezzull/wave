# 1inch — Aqua & SwapVM 🔴 P0

## Prize

**Build an Aqua App — $5,000** (1st $2.5k / 2nd $1.5k / 3rd $1k). Custom Aqua app implementing a sophisticated DeFi position. **SwapVM projects scored higher**; modifying SwapVM opcodes / defining own instructions explicitly invited (redeploying modified SwapVM contracts is fine). Requirements: official Aqua/SwapVM contracts, onchain token transfers in the final demo (local fork OK), proper git history.

## ⭐ Pitch alignment from the Aqua whitepaper

The whitepaper's own thesis IS our product's reason to exist:

- Competition shifts "from TVL to formula optimization… **a breakthrough strategy can go from zero to significant liquidity in minutes**" — but only for pros who can write strategies. Our compiler democratizes that.
- §4.2 literally enumerates our target outputs as the intended use cases: "one LP might run constant product AMM with static fees, another implements **dynamic fees responding to volatility**, while a third uses **concentrated liquidity with inventory-based pricing**."
- Killer stat for the pitch: on 90% of days in 2025, **94% of Uniswap v2 liquidity sat idle** (85% v3, 84% v4, 83% Curve) — source: https://dune.com/1inch/idle
- Whitepaper glossary names our user: **"Strategy builders… focus on pricing logic, execution algorithms and risk management."** We are the compiler for strategy builders.

## SwapVM ground truth (whitepaper v1.0, release/1.1 repo)

### Architecture
- EVM execution engine for swaps. Programs = serialized bytecode, identified by hash; **no custom contract deployment needed per strategy**.
- **Six registers:** `balanceIn`, `balanceOut`, `amountIn`, `amountOut`, `amountNetPulled`, `nextPC`. Register set designed to be extensible.
- **Context** = VM state (nextPC, taker-args pointer, opcode table, static flag) + read-only **SwapQuery** (order hash, maker/taker, tokens, `isExactIn`) + mutable registers.
- **Bytecode:** `[opcode: 1 byte][params_length: 1 byte][params: N bytes]`. Opcodes are EVM functions; direction-aware via `isExactIn` (one bytecode serves both directions).
- **Nested `runLoop()`**: fee instructions are *wrapping* — adjust amount, delegate to inner program, finalize. `quote()` entry point = read-only, **100% accurate off-chain simulation** ⭐ (the safety loop: compile → quote-simulate → verify → ship).
- "2D" ops = two-token optimized; "XD" = multi-token.

### Instruction set v1.0 (complete list)
- **Controls:** `_jump()`, `_jumpIfTokenIn()`, `_jumpIfTokenOut()`, `_deadline()`, `_salt()` (no-op uniquifier), `_onlyTakerTokenBalanceNonZero()` (**natively supports ERC-721** → token-gated strategies), `_onlyTakerTokenBalanceGte()`, `_onlyTakerTokenSupplyShareGte()`
- **External call:** `_extruction()` — arbitrary external call from a program; whitepaper's cited use case: **oracle prices in swap calculations**
- **Swap/AMM:** `_xycSwapXD()` (x·y=k), `_xycConcentrateGrowLiquidity2D()` (concentrated liquidity, fee reinvest via sqrt), `_peggedSwapGrowPriceRange2D()` (sqrt-linear curve for pegged assets, width param A), `_decayXD()` (time-decaying virtual reserve offset = **built-in anti-sandwich/MEV protection**)
- **Fees (all wrapping):** `_flatFeeAmountInXD()`, `_protocolFeeAmountInXD()`, `_aquaProtocolFeeAmountInXD()` (via Aqua `pull()`), `_dynamicProtocolFeeAmountInXD()` (**queries external fee-provider contract via staticcall at execution time**), `_aquaDynamicProtocolFeeAmountInXD()`
- **Canonical ordering (security-critical!):** `aquaProtocolFee → [swap-instruction] → flatFee → swap → salt`. Conservation invariant: `pool_balance + protocol_fee = initial_balance + total_amountIn`.

### Core invariants — any custom opcode MUST maintain (Q&A armor)
1. Exact in/out symmetry · 2. Swap additivity (prefer subadditive) · 3. quote()/swap() consistency · 4. Price monotonicity · 5. Rounding favors maker · 6. Balance sufficiency (revert if amountOut > balanceOut) · 7. Strategy liveness (survive one-sided depletion)

### ⚠️ Custom-opcode plan
`_extruction()` + `_dynamicProtocolFeeAmountInXD()` already cover "call an oracle" and "external dynamic fees" — a naive volatility-fee opcode would duplicate stock functionality and judges will know. Candidates that genuinely extend the instruction set:
1. **`_inventorySkew2D()`** — shifts quote price based on current `balanceIn/balanceOut` deviation from a target ratio (params: target ratio, max skew bps). Registers-native, impossible to replicate cleanly via `_extruction`, and the Aqua whitepaper names "inventory-based pricing" as a desired strategy. **Primary candidate.**
2. **`_oracleGuard2D()`** — reverts (or widens spread) when oracle price deviates from implied pool price beyond a threshold; cleaner + cheaper than composing `_extruction` + jumps, and doubles as the agent-safety story.
3. Stretch condiment: ERC-721-gated strategy via stock `_onlyTakerTokenBalanceNonZero()` (zero extra work, demo flavor).

## Aqua ground truth

- Virtual balance hierarchy: `Maker → App → StrategyHash(bytes32) → Token → Balance`. Strategy = ABI-encoded opaque bytes, **immutable**; change = `dock()` + `ship()` (pure config, no token moves) ⭐ the retune loop.
- `pull()` decreases virtual balance + transfers maker→taker; `push()` increases + returns tokens; **push auto-compounds** (earned tokens immediately expand usable balance).
- Custody stays in maker wallets; exposure = ERC-20 allowance granted to Aqua. `pull()` checks real balances — underfunded strategy trades revert ("illiquidity as temporary friction", makers should dock chronically underfunded strategies — the agent can monitor this).
- Apps inherit `AquaApp`; taker flow: app `pull()`s, taker pays inside `aquaAppSwapCallback` via `push()`; guard `nonReentrantStrategy(maker, strategyHash)`.
- SLAC = notional liquidity / wallet equity; leverage(3x) × strategy-sharing(3x) ⇒ up to ~9x amplification — good demo metric to display.

## SDK (`@1inch/aqua-sdk`)

- `AquaProtocolContract` (tx encoding/decoding), `AQUA_CONTRACT_ADDRESSES` (**13+ networks pre-configured**), events `Shipped/Docked/Pushed/Pulled`, `calculateStrategyHash()`, `encodeShipCallData()/encodeDockCallData()`.
- **No ProgramBuilder in the SDK** — strategies are ABI-encoded per app schema (`encodeAbiParameters`, e.g. XYCSwap: maker, token0, token1, fees, salt). The ProgramBuilder lives in **swap-vm-template** (Hardhat + TS; `AquaAMM.buildProgram()` example). The compiler layer wraps that.

## Notes

- Opcode dispatch + custom-opcode recipe → see [SWAPVM-INTERNALS.md](./SWAPVM-INTERNALS.md) (subclass `AquaOpcodes`, append to `_opcodes()`, 16-line router; Solidity ProgramBuilder resolves indices from function pointers).
- Program length limit: 65,535 bytes (uint16 jumps).
- Takers: a plain EOA can call `router.swap()` directly (verified in template tests) — MockTaker optional.
- release/1.1 instruction set is much bigger than whitepaper v1.0 (LimitSwap, MinRate, DutchAuction, TWAP, BaseFeeAdjuster, progressive fees, unwired OraclePriceAdjuster) — see internals doc.

### Open
- ~~Which chain to fork for the demo~~ — **Decided: Sepolia** (see [PROD-TESTNET.md](../../strategy/PROD-TESTNET.md)). 1inch does NOT deploy Aqua on Sepolia, so we deploy the Aqua + SwapVM stack ourselves on Sepolia (`yarn deploy sepolia` / `make deploy-swap-vm-aqua` with `OPS_NETWORK=sepolia`); Sepolia has the live Chainlink feed `_oracleGuard2D` needs and real WETH/USDC.
- Review the SwapVM 1.1 license file (custom Degensoft license — fine for hackathon redeploy per prize rules, check anyway).

## Links

- Repos: https://github.com/1inch/aqua · https://github.com/1inch/swap-vm (release/1.1) · https://github.com/1inch/swap-vm-template · SDK: https://github.com/1inch/sdks/tree/master/typescript/aqua
- Whitepapers: SwapVM (v1.0) · Aqua
- Workshop: "The Art of AMM" (Bukov) https://www.youtube.com/watch?v=bdhba23BEzg ← must-watch
- Idle liquidity dashboard: https://dune.com/1inch/idle
