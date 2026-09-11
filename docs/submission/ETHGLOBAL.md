# ETHOnline 2026 — Submission prose (Continuity track)

**Window:** 4–16 Sep 2026 · **Submission registered as:** Continuity (links the ETHGlobal Lisboa 2026 submission)  
**Partners to select:** 1inch (Aqua App + Aqua App Continuity) · The Graph (AI Use Case Continuity + Composable) · World (AgentKit Continuity)

Fill `[ENTITY_ID]` / `[TX]` placeholders after the live redeploy (see `docs/DEPLOY-LIVE-TESTNET.md`).

---

## 1. Project description (short)

**wave** is a social market for natural-language on-chain strategies on 1inch **SwapVM**. You describe a market-making strategy in plain English; an agent compiles it to SwapVM bytecode, safety-checks it, records **who wrote it on-chain**, and ships it via Aqua on Sepolia. Profiles, threads and the feed are address-keyed **The Graph** queries — there is no database. A like is liquidity: capital on the card, not a thumb. At ETHOnline we added the trust layer: **World ID verifies the humans who publish; AgentBook verifies the agents that act.**

---

## 2. What existed before vs what we built during ETHOnline (Continuity disclosure)

**Existed at Lisboa (submitted):** SwapVM fork + 2 custom opcodes (`_inventorySkew2D`, `_oracleGuard2D`), the deterministic compiler (Zod→AST→IR→bytecode, reject-and-rewrite), the subgraph (swaps, capital), the agent (compose/monitor/retune, HITL), the Next.js feed + compose, live Sepolia router/Aqua.

**New during ETHOnline (this event's work):**
- **The post lives on-chain** — `StrategyDescribed`: the description ships in the announce tx; forks read the exact bytes back.
- **On-chain authorship** — new `StrategyFactory.attribute()` contract (+ tests): every ship records its author; the subgraph indexes `Strategy.author`; `/u/<wallet>` profiles, `/chat` threads and fork attribution are address-keyed queries. Before this, every strategy "belonged" to the agent EOA.
- **One-id ship pipeline, hardened** — announce → attribute → approve → dock, all keyed on `keccak(wrapped abi.encode(order)) = SwapVM.hash = the Aqua dock hash`. We found and fixed a subtle ABI-encoding mismatch that docked liquidity under unreachable hashes; the fix is fork-proven byte-exact with regression tests.
- **Live agent stream** — `/api/stream/retune` SSE with per-connection dedup; the UI proxies it, so the feed shows the autonomous agent acting in real time.
- **World AgentKit trust layer** (the new sponsor work): World ID publish gate (proof signal bound to the exact payload, one-shot nullifier ledger), AgentBook-gated MCP surface (anonymous POST → 403 `agentkit-required`), Settings trust panel, and the required feedback document (`FEEDBACK-WORLD.md`, written in itinere).
- **Full local-first stack** — anvil Sepolia fork + EIP-1898 rpc-shim + graph-node + scripted browser E2E: the whole product runs and demos on one laptop.

---

## 3. How it's made

| Layer | What | Where |
|---|---|---|
| Contracts | SwapVM + 2 opcodes + `StrategyFactory` (authorship) + `EnsStrategyRouter` (described announce) | `srcs/requirements/swap-vm/` |
| Compiler | Zod AST → canonicalize → rules → IR → emit + disassembler + `programHash` | `srcs/requirements/compiler/` |
| Subgraph | Strategy (author!) / Swap on Router + Aqua + Factory; Studio `wave` v0.0.5 live, v0.0.6 with authorship | `srcs/requirements/subgraph/` |
| Agent | Mastra compose/monitor/retune/gate · MCP reads+writes (AgentKit-gated) · ship pipeline · retune SSE | `srcs/requirements/agent/` |
| Frontend | Next.js App Router · Privy · SSR feed · profiles `/u/<addr>` · threads `/chat` · stream `/api/stream` · World publish gate | `srcs/requirements/ui/` (package `frontend`) |

**Data rule:** stop the subgraph → cards lose stats, discovery stops, retune stops. There is nothing else to read from.

**Test map:** swap-vm 755 · agent 115 · compiler 54 · frontend 24 · subgraph live invariants — all green.

---

## 4. Partner write-up — 1inch (Aqua App / Continuity)

SwapVM extended with two first-class instructions (not `_extruction` bolt-ons), preserving quote/swap consistency. Strategies are Aqua-docked programs — liquidity stays in the maker wallet; `ship()`/`push()`/`pull()` events are the capital truth the subgraph indexes. Demo shows the full ship pipeline on-chain (announce → attribute → approve → dock, receipts on screen) plus a judge-triggerable oracle halt via `MockAggregatorV3` (disclosed). License: `LicenseRef-Degensoft-SwapVM-1.1`; "Powered by SwapVM — © Degensoft Ltd 2025" in the UI/README.

---

## 5. Partner write-up — The Graph (AI Use Case Continuity)

**Endpoint:** `https://api.studio.thegraph.com/query/1756983/wave/v0.0.5` (v0.0.6 with authorship lands with the redeploy)  
**Indexed:** Router (`StrategyDeployed`, `StrategyDescribed`, `Swapped`) + Aqua (`Pushed`/`Pulled`/`Docked`) + Factory (`StrategyAttributed`).

The agent is *made of* Graph data: the monitor reads entity deltas, a pure policy decides, and every autonomous retune **cites the entity id** in the evidence log — data-caused, zero-click. The social layer is the same subgraph: profiles, threads, capital, authorship — all address-keyed queries, no database anywhere.

**Live entity IDs (fill after redeploy):** strategy `[STRATEGY_ID]` · swap entity `[SWAP_ENTITY_ID]` · evidence (first live retune): entity=`[ENTITY_ID]` decision=`[ACTION]` tx=`[TX_HASH]`

---

## 6. Partner write-up — World (AgentKit Continuity)

The anti-sybil story, live in the product:
- **Humans prove it to publish** — IDKit in the compose→ship flow; `signal = sha256(canonical JSON of the exact payload)` so a proof unlocks only the strategy it was minted for, once (nullifier ledger server-side).
- **Agents prove a human backs them** — `POST /mcp*` requires a signed AgentKit request resolved through **AgentBook**; anonymous scripts get `403 x-agentkit-error: agentkit-required`. Usage counters + anti-replay nonces in libsql.
- **Trust is visible** — the Settings trust panel shows wallet verification state and both agent wallets' AgentBook status.
- **Feedback doc:** `FEEDBACK-WORLD.md` — written while building (SDK sharp edges, Portal navigation, one-shot signing key), exactly what the bounty asks for.

One line for judges: *on wave, trust is free only if the actor is a human — in person or behind a verified agent.*

---

## 7. Feedback (ETHGlobal form)

What went well: the fork-first stack (every feature E2E-verified on a Sepolia fork before touching live); on-chain authorship making the social layer real; AgentKit's typed API being genuinely readable.

Hardest: Aqua's dock-hash semantics (the encoding mismatch cost a day — documented in the code comments); keeping the retune strictly data-caused; pnpm 11 build-script gates across four packages.

---

## 8. Checklist before submit

- [ ] Live redeploy done (router + factory + subgraph v0.0.6 — see `docs/DEPLOY-LIVE-TESTNET.md`)
- [ ] Fill entity IDs in §5
- [ ] AgentBook registration of the two agent wallets (phone + World App)
- [ ] One real Sandbox App verification through the publish gate
- [ ] Demo video 2–4 min, real voice, ≥720p (three-way trust beat: human ✓ / agent ✓ / bot ✗)
- [ ] Select Continuity + partner prizes (1inch, Graph, World)
- [ ] AI attribution in README
