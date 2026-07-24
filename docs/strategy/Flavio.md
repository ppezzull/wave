# Flavio — ENS / Compiler (P2)

## Mission
Own the deterministic TS compiler (Move 1: `Spec → AST → IR → BytecodePlan`, reject-and-rewrite, canonical ordering) and the ENS agent side (`resolveVerify`, `register`, ENSIP-25/26 program-hash verify, subnames). Your work wins **ENS AI Agents ($1.5k)** + gives the Creative auto-entry ($1.5k) real substance, and carries the finalist **Originality + WOW** criteria — the judge-typed reject is the demo's signature beat. Note: you and Flaviano are different people; he is Solidity (P1), you are TS (P2).

## Hour-by-hour

**h0–2 — `ast.ts` + Zod freeze 🔴**
- `srcs/requirements/compiler/src/ast.ts`: typed AST for the 9 block types + the Zod-bounded DSL from playbook §1.5 (bounded numerics, unknown types rejected, `feed` resolves via a compiler-owned Chainlink symbol registry — the LLM never emits an address). **Freeze as `specVersion: 1` at h2** — after h2, changes are additive-with-default only. Publish the frozen spec to Flaviano (ArgsBuilder layouts) and Pietro (UI fixtures).
- Serves: G1; spine origin.

**h8–10 — canonical ordering + reorder diff**
- `srcs/requirements/compiler/src/canonical.ts`: enforce `Deadline → Concentrate → Decay → OracleGuard → InventorySkew → MakerFee → ProtocolFee → Curve → Salt`; produce the AST move-arrow + unified diff for an unsafe order (the WOW beat's raw material). Read Flaviano's h8–10 opcode semantics as they land — your IR encodes them.

**h10–12 — rules stubs + IR slot map**
- `srcs/requirements/compiler/src/rules.ts` as **rules-as-data** (`{predicate, message, rewrite}` records): stub all 6, implement the two demo-critical first (`OracleGuardMustPrecedeSkew`, `ProtocolFeeLeMakerFee`). `ir.ts` slot resolution reads **`slots.json`** (Flaviano generates at G1) — **never hand-count opcode indices**; add the TS-side snapshot test that fails loudly on drift.

**h12 = G1 🟢** — bar: canonical reorder visibly fixes an unsafe order (feeds the G1 demo check). If missed: runbook cut — `canonical.ts` + rules 1&2 + TS-direct emit only.

**h14–16 — byte-identical emit + disassembler (spine)**
- `emit.ts`: `[opcode:1][argsLength:1][args]` per instruction, byte-identical, deterministic (canonical serialization — property test: same spec byte-identical across runs incl. JSON key-order shuffles). **TS-direct emit is PRIMARY — the on-chain `StrategyFactory` is a post-G2 stretch**; equivalence is proven via `quote()`-hash match, not a factory.
- **Disassembler + round-trip test**: `decode(emit(ir)) === ir`. Hand the decoder to Pietro — it renders his bytecode pane. This pair is your "is it really a compiler?" armor: determinism + total typed verdicts + round-trip.

**h16–18 — `programHash` + ENS register**
- `programHash()` = keccak256 of emitted bytes → hand to Flaviano for the ship path/`StrategyDeployed` event. `srcs/requirements/agent/src/ens/register.ts`: register the strategy subname on the fork (mainnet fork has the real ENS registry — no hard-coded values), write ENSIP-25 records + the `v0.programhash` text record. Records are **verifiable, not read at execution time** — never read safety bounds off-chain mid-swap. The **round-trip hash test** (emit keccak == ENS record == on-chain program) goes in CI — your G2 artifact.

**h18–20 — `resolveVerify` into the swap path**
- `srcs/requirements/agent/src/ens/resolveVerify.ts`: resolve subname → read recorded hash → recompute from the live on-chain program → **abort on mismatch**. Build the negative path deliberately (tampered record fixture) — the ENS judge's proof is the red abort, not the green check.

**h20 — deliver `recompileAndShip()` to Pietro**
- Wrap dock → recompile (your compiler) → ship into one callable module (in-process, imported by the Next.js server). This is the retune's action arm; without it Pietro's h22 autonomous loop has nothing to fire.

**h22–24 = G2 🟢 — reject rules + diff renderer**
- Remaining 4 rules (`SaltMustBeTerminal`, `OracleStalenessRequiresGuard`, `FeeAfterCurve`, `NoDuplicateDeadline` — ~15 min each as data records) + the typed `Rejection` (rule + corrected rewrite + unified diff) + the diff renderer Pietro's card consumes. G2 bar: reject+rewrite+diff green; bytecode matches the ENS-recorded hash.

**h28–30 → G3 (h30) 🟢** — edge cases, fuzz specs through Zod asserting every input either compiles or throws a typed `Rejection` (never a crash); polish the rejection copy judges will read on screen. Stretch ONLY if G2 landed clean: on-chain `StrategyFactory`. Freeze h30.

**h34–35 — demo support** — pre-warm the LLM cache for Beat A (failure tree: flake → Pietro narrates the cached-but-real response, you retry silently). Prep tampered-record fixture for Q&A.

## BLOCKERS / DEPENDENCIES ON OTHERS

**You need:**
- **From Flaviano:** `StrategyDeployed(strategyId, programHash, ensNode)` ABI at **h2** (`resolveVerify` target); **locked opcode semantics at h10** (your IR encodes his arg layouts — if his rewrite diverges from the §1.5 spec, your emit is wrong silently); **`slots.json` at G1** (slot resolution; consume, never hand-count); deployed router address from his h18–20 for live `resolveVerify`.
- **From Pietro:** UI fixtures conforming to your frozen spec (so his card renders your verdict shape); the SSE/card contract by h16–18 so your `Rejection` type matches what his card consumes; graph-node liveness doesn't block you.

**You owe:**
- **To Flaviano:** frozen Zod spec v1 at **h2**; `programHash()` at **h16**.
- **To Pietro:** the disassembler decoder at **h14–16** (his bytecode pane); the typed `Rejection` + diff payload at **h22–24** (his red card); **`recompileAndShip()` at h20** (his autonomous retune — the hard G2 dependency); the ENS-resolution client his `EnsDiscovery` pane calls at h20–22.

## Dealbreaker
**The program-hash chain, with the negative path live**: compiler-emitted keccak == ENS `v0.programhash` text record == recomputed on-chain program hash, and settle **aborts on mismatch** in front of the judge — no hard-coded values. Plus: **you are at the ENS booth Sunday morning — mandatory for both ENS tracks; missing it forfeits $3k of auto-entered prizes regardless of code quality.**

## Scope-cut floor
`canonical.ts` + rules 1&2 + TS-direct emit + the hash-verify. Droppable in order: `StrategyFactory` (already demoted), rules 3–6, ENSIP-26 JSON records, diff-renderer polish. **The hash-verify is never cut** (G2 rule in the runbook), and the reject beat needs at least rule 1 with its diff.

## Demo / Q&A role
Narrate Beat A (sentence → bytecode → safety card → live `ship()`) and the judge-typed reject. Q&A owner for: "is this really a compiler?" (determinism property test, typed total verdicts, disassembler round-trip — show, don't argue), "why can't the agent deploy something harmful?" (LLM freedom only inside Zod bounds; everything downstream deterministic — the §1.5 pipeline sentence), and ENSIP-25/26 (say **"draft standard"**). Sunday: **ENS booth, in person, morning — you are the mandatory attendee.**
