# ETHGlobal Lisboa 2026 — Submission prose (Pietro / P3)

**Deadline:** Sun Jul 26, 09:00 WEST · Choose **"Finalist and Partner Prizes"**  
**Partners to select (3):** 1inch (SwapVM/Aqua) · The Graph (AI Use Case) · ENS (AI Agents)

Fill `[ENTITY_ID]` / `[TX]` placeholders after Item E (live Sepolia seed).

---

## 1. Project description (short)

**wave** is a social market for natural-language on-chain strategies on 1inch **SwapVM**. You describe a market-making strategy in plain English; an agent compiles it to SwapVM bytecode, safety-checks it, registers it under ENS, and ships it via Aqua on Sepolia. The feed ranks live strategies by return × recency × followers — every number from **The Graph** or an **ENS text record**. There is no database. A like is liquidity: capital on the card, not a thumb.

---

## 2. How it's made

| Layer | What we built | Where |
|---|---|---|
| VM opcodes | `_inventorySkew2D`, `_oracleGuard2D` on `StrategyOpcodes` / `EnsStrategyRouter` | `srcs/requirements/swap-vm/` |
| Compiler | Zod AST → canonicalize → rules → IR → emit + disassembler + `programHash` | `srcs/requirements/compiler/` |
| Subgraph | Strategy / Swap / Follow / Follower on Sepolia EnsStrategyRouter + ENS Public Resolver + Aqua | `srcs/requirements/subgraph/` · Studio `wave` **v0.0.4** |
| Agent | Mastra compose / monitor / retune / ens · MCP reads+writes · evidence log | `srcs/requirements/agent/` |
| UI | Next.js App Router · Privy (Sepolia) · SSR feed · `/compose` · SSE `/api/compile` + `/api/stream` | `srcs/requirements/ui/` |

**Data rule:** stop the subgraph → cards lose stats but still list; stop ENS → feed empties. Follow = ENS `setText` on `wave.following/<strategy>` (not a DB insert).

---

## 3. Partner write-up — 1inch / SwapVM

We extended SwapVM with two first-class instructions (`_inventorySkew2D`, `_oracleGuard2D`) instead of bolting behavior onto `_extruction`, preserving quote/swap consistency. Strategies are Aqua-shipped programs (liquidity stays in the maker wallet). Demo shows live `ship()` / `swap()` on Sepolia and a judge-triggerable oracle halt via `MockAggregatorV3` (disclosed). License: `LicenseRef-Degensoft-SwapVM-1.1`; UI/README carry **"Powered by SwapVM — © Degensoft Ltd 2025"**.

---

## 4. Partner write-up — The Graph (AI Use Case)

**Subgraph:** Studio project `wave`, deployment **v0.0.4** (issue #51)  
**Endpoint:** `https://api.studio.thegraph.com/query/1756983/wave/v0.0.4`  
**Alias:** `https://api.studio.thegraph.com/query/1756983/wave/version/latest`  
**Indexed:** `EnsStrategyRouter` (`StrategyDeployed`, `Swapped`, …) + Sepolia ENS Public Resolver `TextChanged` → `Follow` / `Follower` + Aqua capital.

The agent’s monitor reads subgraph deltas (`graphDelta` / `subgraphDeltaSource` from PR #47, opt-in via `MONITOR_SOURCE=subgraph`); each autonomous retune **cites the `Swapped` entity id** in the evidence log — proof the retune is data-caused, not time-triggered.

**Live entity IDs (v0.0.4 seed):**
- Strategy: `0xcbbdf005a951413c0264fab64661432635f8f9ff6e5af42eec48256671fbb999`
- Swap: `0xe8fd84f7b57a9ba724c3250274f06c65083d2be2f419a353b265ac8096020f1db9010000`
- ENS: `eth-usdc-guarded.wave.eth` (ensNode `0xb3ef0aec…a13f`)
- Evidence (fill after first live retune): entity=`[SWAP_ENTITY_ID]` · decision=`[ACTION]` · tx=`[TX_HASH]`

Unplug the subgraph → discovery + retune stop. That is why The Graph is load-bearing for Aqua (1inch workshop: no first-party indexer).

---

## 5. Partner write-up — ENS (AI Agents)

Strategies are ENS subnames under the wave parent. Records:

| Key | Role |
|---|---|
| `description` | Literal compiler input ("the post is the prompt") — byte-for-byte into `/api/compile` |
| `v0.programhash` | Trust anchor — UI hash-verify chip; mismatch → **TAMPERED** |
| `agent-endpoint[mcp]` | ENSIP-26 agent MCP URL |
| `wave.following/<id>` | Follow graph (creative use of text records) |

Takers discover strategies via ENS (no DB). `resolveVerify` / live on-chain hash compare is the ENS prize Gate 1 beat. **Booth:** Flavio Sunday morning (mandatory).

---

## 6. Feedback (ETHGlobal form)

What went well: SwapVM opcode + compiler spine; first-party subgraph as Aqua’s missing discovery layer; ENS as identity + follow + hash trust.

Hardest: Sepolia seed timing + keeping retune strictly subgraph-caused; Classic-track “from scratch” discipline on top of vendored SwapVM.

---

## 7. Checklist before submit

- [ ] Subgraph non-empty (`scripts/verify-subgraph.sh`)
- [ ] Fill entity IDs in §4
- [ ] Demo video 2–4 min, real voice, ≥720p
- [ ] Select Finalist + Partner Prizes (1inch, Graph, ENS)
- [ ] AI attribution in README
- [ ] ENS booth staffing assigned
