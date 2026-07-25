# Event Runbook — the 36 Hours

_Integration risk — everything works separately at hour 28, nothing works together at hour 34 — is our failure mode. The gates below exist to detect slip early enough for the cut order to matter._

## Integration gates (hard checkpoints, times from kickoff)

_Aligned with the 5-move build plan in [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md) §3. Gate bars are the playbook's bars._

| Gate | Deadline | Definition of done | If missed |
|---|---|---|---|
| **G1 — Walking skeleton** | ~hour 12 | Clean `_inventorySkew2D`/`_oracleGuard2D` rewrite compiles + stale-halt/clamp tests green (Move 2); compiler canonical-reorder visibly fixes an unsafe order (Move 1); UI walking skeleton on fixture (Move 4). The Oracle-Guard Spine (critical path) must hold. | Move-2 scope-cut: keep `OracleGuardStaleHalt` + band-containment only, drop kink-monotonicity. Move-1 scope-cut: `canonical.ts` + rules 1&2 + TS-direct emit (drop on-chain `StrategyFactory`). |
| **G2 — Real pipeline** | ~hour 24 | Autonomous retune fires with zero manual trigger (first-party subgraph entity → `graphDelta` → dock/ship, Move 5); reject-and-rewrite + diff green (Move 1); bytecode matches ENS-recorded program-hash (Move 5); full live UI + ENS chip (Move 4). | Graph fallback: bypass subgraph, poll `Swapped` via `eth_getLogs` (label "subgraph syncing"). Never cut the ENS hash-verify. |
| **G3 — Feature freeze** | ~hour 30 | No new code. Demo choreography (3 beats + judge-triggered revert, Move 3) + video + canned fallbacks only. | Drop Beat C (autonomous retune) to a narrated screenshot; **never** cut the live `swap()` or the judge-triggered halt — those are the rubric-killers. |

**Cut-order triggers live here, not in 3am debate:** each gate miss executes the pre-agreed cut automatically. Contest it only with a two-person majority.

**Finalist-first cut priority (the rule that governs all cuts):** *Finalist = best overall project.* If hours run short, sacrifice **sponsor-specific polish first** (Graph Tooling autonomous cycle, ENS Creative, x402 visual) **before anything that deepens the core** (opcode tests, the safety card, the reject-and-rewrite WOW beat, the live `swap()`). The finalist case survives losing a sponsor track; it does **not** survive a shallow core.

## Sleep rotation

No person under 3h/night. Rotation: one of us sleeps 02–06, one 04–08, one 06–10 (assign at kickoff). P1's brain is the scarcest resource Saturday; protect it for opcode/invariant work, not CSS.

## Workload split

Final division of work across the three-person team:

- **P1 (Flaviano)** — on-chain core: the two custom opcodes (`_inventorySkew2D`, `_oracleGuard2D`), the Sepolia deploy, and the subgraph's on-chain landing (`graph deploy` + first `Swapped` entity).
- **P2 (Flavio)** — compiler and ENS identity: `resolveVerify`, `register`, `programHash`. P2 also owes the autonomous-retune action arm `recompileAndShip()` by hour 20.
- **P3 (Pietro)** — the data→agent→product stack: `graphDelta`, the autonomous retune, the subgraph `schema`/`mapping`, x402, the UI, the demo, and all submission prose.

The retune's action arm (`recompileAndShip()`, delivered by P2 at h20) and its data source (P1's `graph deploy` at h18–20) are the only true cross-person dependencies; co-locating the consumer (P3) with the evidence log and UI is simpler than splitting the agent layer across two people.

⚠️ P3 carries a heavy load (subgraph mapping + retune + x402 + UI + demo + all prose). Mitigations baked into the build: P1 lands `graph deploy` (owns Sepolia deploy infra), P2 owes `recompileAndShip()` by h20, x402 is post-G2 only, the agent runs in its **own container** (Mastra + z.ai; see [AGENT.md](./AGENT.md)) — P3 only surfaces the `/review` HITL queue in Next.js, it does not host the agent. **P3's cut order: x402 first → `EnsDiscovery` polish second → never the retune or the safety card.** P3 owns all prose (submission form, partner write-ups, video script) from hour 0 — not "when free." Full Gantt: [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md) §3.

## Sunday morning (hard schedule)

- **07:00–08:30** — P3: submission form prose (description, how-it's-made, 3 partner write-ups + feedback). Others: final fixture run + fallback recording.
- **08:30–09:00** — submit. Buffer is the buffer; do not code into it.
- **Post-09:00 staffing:** ENS booth (mandatory): **Flavio (P2)** · finalist judging session: **Flaviano (P1) + Pietro (P3)** · Sepolia seed + subgraph-sync check before judging: **Flaviano (P1)**. (No-show at the ENS booth forfeits $3k of auto-entered ENS prizes regardless of code quality — Flavio's attendance is a hard requirement.)

## Demo failure tree (rehearse, print before judging)

- **LLM call flakes at beat 2** → P3 talks through the cached-but-real response (pre-warmed, disclosed as cached); P2 retries silently.
- **x402 hiccups at beat 3** → env-var swap to Studio key (rehearsed); line: "the agent normally pays per query — falling back to our key."
- **Sepolia RPC dies / tx fails at a beat** → backup Sepolia RPC URL (Alchemy/Infura) + second funded wallet already warm on backup laptop; P1 swaps while P3 narrates the ENS records already on screen. No fork to re-cut, no canned twin.
- **Total demo loss** → the pre-recorded fallback video (recorded at G3), narrated live. Never debug on stage past 20 seconds.
- **Oracle staleness fires spuriously** → shouldn't happen (Sepolia Chainlink feeds update live); if it does: that IS the circuit breaker working — narrate it as such, honestly, and switch the demo path to the mock-oracle scenario.

## Key/wallet matrix

| Key | Holds | Funded with | On which machine | Owner |
|---|---|---|---|---|
| Mainnet ENS-owner key | strategist.eth (or chosen name) | dust ETH | ___ (minimize exposure — this is a real mainnet key on a demo laptop) | ___ |
| Base mainnet key | x402 payments | ~$5 USDC + gas | ___ | ___ |
| Sepolia key | deployer + seed + demo wallets | faucet ETH (pre-funded ×3–4 faucets) | ___ | ___ |

Assign owners and machines at kickoff.

## Compliance heartbeat (every ~4h, P3)

Commits pushed (no giant batches) · AI-attribution log current · spec/prompt files in repo · "Powered by SwapVM — © Degensoft Ltd 2025" in README + UI from hour 1.

## Submission & compliance checklist (Sunday — deadline 09:00 WEST)

**Deadline:** Sunday Jul 26, 09:00 WEST. Plan the video for pre-dawn, not 08:30. Submission prose (description + "how it's made" + 3 per-partner write-ups w/ feedback ≈ 60–90 min) is a P3 deliverable, slotted 07:00–08:30 above. Choose **"Finalist and Partner Prizes"** at submission (we want the finalist session).

### Global (ETHGlobal rules)

- [ ] All code written after the official start (Classic track). Public libs/starter kits OK — be transparent.
- [ ] Continuous commits from hour one (single-commit repos get DQ'd).
- [ ] AI-attribution section in README (which parts/files were AI-assisted); include all spec/prompt/planning files.
- [ ] Select **3 partner prizes** (multi-track partners count as 1). Leverage: Graph = all 3 tracks at one slot; ENS = 2 tracks. Frame materials to qualify for every track of each chosen partner.
- [ ] Sunday-morning staffing decided before Saturday night: ENS booth (mandatory) / finalist judging / other booths — assign all 3 people.

### Demo video

- [ ] 2–4 min · ≥720p · real voice (NO AI voiceover) · no phone recording · no music-with-text · no speed-up.
- [ ] ≤20s intro, then product in action; slides ≤4 bullets.

### Per-sponsor

**1inch** — [ ] official Aqua/SwapVM contracts (modified redeploy allowed) · [ ] on-chain token transfer in final demo (Sepolia OK — the rule's "local fork" bar is cleared by a public, verifiable chain) · [ ] proper git history · [ ] license compliance (custom opcodes under `LicenseRef-Degensoft-SwapVM-1.1`, "Powered by SwapVM — © Degensoft Ltd 2025" in README+UI, changes marked/dated; see `../sponsors/1inch/LICENSING.md`).
**The Graph (AI Use Case)** — [ ] **live** data from a Graph provider (mocked/static disqualifies) · [ ] load-bearing (agent reasons over data) · [ ] public repo + 2–4 min video + writeup of which subgraphs/endpoints · [ ] bonus: reusable SKILL/MCP.
**ENS (AI Agents)** — [ ] load-bearing identity/discoverability, no hard-coded values · [ ] video or live demo link · [ ] **present at ENS booth Sunday morning (mandatory)**.

### Judging session

7 min: 4 demo + 3 Q&A. Prepped answers: inspiration / tools & why / hardest challenge. Insurance: fresh Sepolia deployment (redeploy-if-needed) + offline fallback recording.
