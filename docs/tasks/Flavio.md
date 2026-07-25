# Flavio — ENS + Agentic (P2)

Owns identity + the agentic brain: ENS agent side (resolveVerify, register, program-hash verify) + the agentic layer (Foundry Agents SDK + z.ai LLM) — parse intent → bounded spec; read subgraph → decide → call Flaviano's `dock()`/`ship()`. Card payloads owed to Pietro per [frontend.md](../strategy/frontend.md).

| ☐ | Task | Person | Collab |
|---|---|---|---|
| ☐ | Stand up Foundry Agents SDK template (prompt + tool defs + stream handler) with z.ai provider. Smoke: one NL prompt → Zod-validated bounded form (LLM writes no code). Confirm against Flaviano's frozen `specVersion: 1` | Flavio | ← Flaviano (spec) |
| ☐ | **Pick the ENS client: viem/ensjs direct vs `ens-cli`.** `ens-cli` is an **experimental preview** — not on npm, breaking changes expected, installed via `npx "https://pkg.pr.new/…@main"`. If you take it, **pin a commit**; a mid-build upstream break lands on the ENS dealbreaker. It does give subname creation, batch records via multicall, and an MCP mode. Decide before `register.ts` | Flavio | — |
| ☐ | **Solve ERC-7930 interoperable-address encoding** — ENSIP-25 keys are parameterised: `agent-registration[<registry>][<agentId>]`, where `<registry>` is an ERC-7930 address. Find a library or implement it. Nothing downstream verifies without it, and it is the only genuinely unknown-cost item on the ENS path | Flavio | — |
| ☐ | **Sepolia dry-run of the whole loop, before wiring anything**: register a parent name → mint one subname → set `agent-context` (ENSIP-26) + a parameterised ENSIP-25 record → resolve all of it back. Proves the loop end to end and proves "no hard-coded values", which **both** ENS prizes require. `Plan.md`'s pre-kickoff row only checks that `getText()` works — that is a fraction of this | Flavio | — |
| ☐ | `agent/src/ens/register.ts` skeleton — register strategy subname on the Sepolia Public Resolver (no hard-coded values), write ENSIP-25 records | Flavio | — |
| ☐ | Confirm `dock()`/`ship()` signature with Flaviano | Flavio | → Flaviano |
| ☐ | Agent parse verified against Flaviano's frozen spec; ENS register base | Flavio | ← Flaviano (spec) |
| ☐ | Complete `register.ts` — write `v0.programhash` text record from Flaviano's `programHash()` | Flavio | ← Flaviano (programHash) |
| ☐ | `resolveVerify.ts` — resolve subname → read recorded hash → recompute from live on-chain program → **abort on mismatch**. Build negative path (tampered-record fixture) — the red abort is the ENS proof | Flavio | ← Flaviano (`StrategyDeployed` ABI) |
| ☐ | **G1** — bar: parse (NL→bounded form) against frozen spec; `resolveVerify` aborts on tampered fixture → **merge to `main`** | Flavio | gate |
| ☐ | `agent/src/monitor/graphDelta.ts` — poll subgraph endpoint (stub against fixture for now); **shared threshold module** `shouldRetune()` consumed by live + canned paths | Flavio | ← Pietro (endpoint) |
| ☐ | `recompileAndShip()` action arm — wrap `dock()`→recompile (Flaviano's compiler)→`ship()` into one in-process callable module | Flavio | ← Flaviano (signature + router address) |
| ☐ | Point `graphDelta` at real subgraph URL; verify real `Swapped` delta readable. **Studio insurance:** greenlight Sepolia+Studio publish only if G2 on track | Flavio | ← Flaviano (endpoint) |
| ☐ | Retune evidence log — timestamped record (GraphQL query, **entity ID**, delta values, threshold decision, dock/ship tx hashes); ENS-resolution client for Pietro's `EnsDiscovery` | Flavio | → Pietro (retune badge + evidence pane) |
| ☐ | Zero-click retune: subgraph delta crosses threshold → decision → `recompileAndShip()` → dock/ship fires; log cites the **entity ID**. **G2 → merge to `main`** | Flavio | gate |
| ☐ | If subgraph unsynced: Pietro's `eth_getLogs` poll with your same threshold module, labeled "logs (subgraph syncing)" — fallback | Flavio | ← Pietro (eth_getLogs) — costs Graph track if what judges see |
| ☐ | Fuzz parse through Zod (every input → valid form or typed error, never crash/free-form); round-trip hash chain test (emit keccak == ENS record == on-chain hash) in CI. **G3 → freeze + merge to `main`** | Flavio | gate |
| ☐ | Pre-warm z.ai cache for Beat A (flake → Pietro narrates cached-but-real, you retry silently); prep tampered-record fixture for Q&A | Flavio | demo support |

**Never cut:** the hash-verify chain + negative path (compiler keccak == ENS record == on-chain hash, abort on mismatch), the zero-click retune citing an entity ID.
**Cut order:** Studio insurance → x402 → ENSIP-26 JSON richness → fuzz coverage.
**Dealbreaker:** the program-hash chain with the negative path live (no hard-coded values; settle aborts on mismatch in front of the judge) + at the ENS booth Sunday morning (mandatory for both ENS tracks; no-show forfeits $3k).
**Demo/Q&A:** narrate Beat A (sentence → bytecode → safety card → live `ship()`) + the judge-typed reject. Own Q&A on "is this really a compiler?" (determinism property test, typed total verdicts, disassembler round-trip — show don't argue), "why can't the agent deploy something harmful?" (LLM freedom only inside Zod bounds; everything downstream deterministic), and ENSIP-25/26 (say "draft standard"). Sunday: ENS booth, in person, morning — mandatory attendee.
