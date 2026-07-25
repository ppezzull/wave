# Flavio — ENS + Agentic (P2)

Owns identity + the agentic brain: ENS agent side (resolveVerify, register, program-hash verify) + the agentic layer (Foundry Agents SDK + z.ai LLM) — parse intent → bounded spec; read subgraph → decide → call Flaviano's `dock()`/`ship()`. Card payloads owed to Pietro per [frontend.md](../strategy/frontend.md).

| ☐ | Task | Person | Collab |
|---|---|---|---|
| ☐ | Stand up Foundry Agents SDK template (prompt + tool defs + stream handler) with z.ai provider. Smoke: one NL prompt → Zod-validated bounded form (LLM writes no code). Confirm against Flaviano's frozen `specVersion: 1` | Flavio | ← Flaviano (spec) |
| ☐ | `agent/src/ens/register.ts` skeleton — register strategy subname on mainnet-fork ENS (no hard-coded values), write ENSIP-25 records | Flavio | — |
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
**Mandatory:** at the ENS booth Sunday morning — no-show forfeits $3k of auto-entered prizes.
