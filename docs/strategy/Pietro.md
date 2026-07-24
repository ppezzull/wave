# Pietro — The Graph / UI / Demo (P3)

## Mission
Own the data + product layer: the first-party subgraph (schema + mapping over `Swapped`), the `graphDelta` autonomous retune loop, the x402/Studio adapter, the Next.js SSR UI (Move 4: split-screen + safety card + `EnsDiscovery`), and demo choreography (Move 3). Your work wins **The Graph AI Use Case ($4k, 1st $2k — the only winnable Graph track)** and carries the finalist **Usability + WOW** delivery. You also own all submission prose from hour 0 (runbook rule — not "when free"). **Load note:** you carry the brief's heaviest slice; your personal cut order is x402 first, `EnsDiscovery` polish second, **never** the retune or the safety card.

> **Your UI spec is [frontend.md](./frontend.md).** Pages, routes, panes, data flow, the demo beat timeline, colors, the failure tree, and your build windows all live there — read it first. The hour-by-hour below points to it instead of restating the visual/technical detail.

## Hour-by-hour

**h0–2 — `timeline.ts` + `controller.ts` 🔴**
- `srcs/requirements/ui/src/demo/{timeline.ts,controller.ts}`: the deterministic 240s stage controller with `DEMO_LIVE=0` canned-twin switching (the ONE un-cannable call is the live `swap()`). See [frontend.md](./frontend.md) §1 (stack) + §4 (beat timeline). Start the compliance heartbeat + prose folder now.

**h2–4 — graph-node bring-up**
- docker-compose graph-node + IPFS + postgres against anvil; index a trivial one-event subgraph. Burn down the known killers now: anvil instant-mine vs block polling, fork-reset reorgs, `eth_getLogs` ranges. **Report a verdict at standup**: works / needs workarounds / arm the `eth_getLogs` fallback. This is the highest-variance risk on the G2 path — Friday evening is when it's cheap.

**h8–10 — UI scaffold, 3 panes on fixture**
- `srcs/requirements/ui/` Next.js App Router, SSR, **no business logic on the client**; agent modules imported in-process server-side (no second service). Build the left/right/bottom panes per [frontend.md](./frontend.md) §3. Fixtures conform to Flavio's frozen `specVersion: 1`.

**h10–12 — `parseProgram` + `safetyReport`**
- Card pulls the 4 numbers + hash-verify gate, canned first paint + 1500ms watchdog — spec in [frontend.md](./frontend.md) §3 (safety card) + §1 (watchdog/fallback).

**h12 = G1 🟢** — bar: walking skeleton on fixture. If missed: fixture-only UI is already the cut floor — protect the card and the panes, drop styling.

**h14–16 — Beat B/C plumbing**
- `liveSwap` + mock-oracle beat wiring into the controller (timeline in [frontend.md](./frontend.md) §4). Consume Flavio's disassembler decoder for the bytecode pane (real tokens, not fixtures — §3 right pane).

**h16 — subgraph handoff (spine)**
- Author `srcs/requirements/subgraph/{schema.graphql,mapping.ts,subgraph.yaml}` against Flaviano's h0–2 ABI: entities for Strategy (id, programHash, ensNode) + Swap (amounts, `cumulativeVolume` rollup). Keep the schema clean/reusable (Composable is auto-entered; don't spend hours on it, but don't couple to test structs either). **Hand to Flaviano — he lands `graph deploy` h18–20 on the fork infra he owns.**

**h16–20 — SSE bridge → real `/compile`**
- Wire the browser↔Next.js SSE stream to the real compile path (the UI's ONLY data path — §5 of [frontend.md](./frontend.md)). Start `make demo-up` skeleton: cut fork → deploy → register ENS → ship → **reset graph-node (wipe postgres, redeploy subgraph)** → fixture swaps → battery → green checklist.

**h20–22 — `graphDelta` + `EnsDiscovery`**
- `srcs/requirements/agent/src/monitor/graphDelta.ts`: poll Flaviano's h18–20 endpoint; **shared threshold module** used by both live and canned paths. `EnsDiscovery` pane (spec: [frontend.md](./frontend.md) §3, 5th pane) resolves the subname live, shows `programHash` vs on-screen bytecode side-by-side — mismatch turns red (the ENS evidence pane).

**h22–24 = G2 🟢 — the autonomous retune (your dealbreaker hours)**
- Zero-click loop: subgraph delta crosses threshold → decision → **Flavio's `recompileAndShip()`** (delivered h20) → dock/ship fires; wire Beat C to it. Write the **retune evidence log**: timestamp, GraphQL query, **entity ID**, delta values, decision, tx hashes — committed to repo and rendered in the UI ([frontend.md](./frontend.md) §4 evidence pane). G2 bar: retune fires with zero manual trigger. If missed: runbook fallback — `eth_getLogs` poll with the same threshold module, labeled "logs (subgraph syncing)"; keeps the demo, **honestly flags that it costs the Graph track if it's what judges see**.
- **Studio insurance decision point:** if G2 landed on time, greenlight the Sepolia+Studio deploy (Flaviano deploys, you publish to Studio and fire one real swap) — insures the "local graph-node isn't a Graph provider" qualification reading. If G2 slipped, skip it; x402 adapter also lives-or-dies here (post-G2 only, env-var Studio-key fallback rehearsed).

**h24–30 → G3 (h30) 🟢 — dry runs + fallbacks**
- `make demo-up` green **twice**, measure subgraph re-sync < the T-15min fork-recut window. Full 240s dry-run recorded — this recording IS the total-loss fallback video base. Record canned twins for every beat. Freeze h30; after that: video, prose drafts, rehearsal only.

**h34–35 — demo run**
- Full rehearsal against a fresh fork cut; the full failure tree + on-stage lines are in [frontend.md](./frontend.md) §7 — print it. **Never debug on stage past 20 seconds.**

**Sunday 07:00–08:30** — submission prose: description, how-it's-made, 3 partner write-ups + feedback (Graph write-up MUST name the subgraph, endpoints, and cite the retune log's entity IDs — qualification requires it). 08:30–09:00 submit; choose **"Finalist and Partner Prizes"**. The buffer is the buffer.

## BLOCKERS / DEPENDENCIES ON OTHERS

**You need:**
- **From Flaviano:** `StrategyDeployed` ABI at **h2** (your mapping); deployed subgraph endpoint + first real `Swapped` entity at **h18–20** (your `graphDelta` — the hard G2 gate); live `_oracleGuard2D` + MockAggregatorV3 control script at **h20–22** (your judge-triggered Beat B revert); fork/RPC hands during the demo.
- **From Flavio:** frozen Zod spec v1 at **h2** (your fixtures); disassembler decoder at **h14–16** (bytecode pane); `Rejection`+diff payload at **h22–24** (red card); **`recompileAndShip()` at h20** — without it your h22 retune has no action arm; the ENS client for `EnsDiscovery` at h20–22.

**You owe:**
- **To Flaviano:** running graph-node from your **h2–4** work (his h18–20 deploy target); `schema.graphql` + `mapping.ts` + `subgraph.yaml` by **h16**; `make demo-up` wrapping his deploy targets by G2 (his T-15 fork cut depends on it).
- **To Flavio:** UI fixtures + the card/SSE contract by **h16–18** (so his `Rejection` type renders correctly); the `EnsDiscovery` pane at h20–22 (his ENS-prize evidence surface); Beat A choreography that showcases his reject beat.

## Dealbreaker
**The autonomous zero-click retune, provably driven by a live subgraph entity delta, with the log citing the entity ID** — plus a demo that never dead-airs (every beat has a rehearsed canned twin). A time-triggered or button-triggered retune scores ~0 on the Graph judge's 35% "effective use" weight; a stage-melt with no fallback loses the finalist slot for everyone.

## Scope-cut floor
Beats A + B-revert only (Beat C drops to a narrated screenshot per G3 rules); three panes + green/red card from fixture JSON; `eth_getLogs` delta poll labeled honestly. **Never cut:** the safety card verdict, the `EnsDiscovery` pane, the live `swap()` beat, the judge-triggered halt. First cuts, in order: x402 adapter → Studio insurance → `EnsDiscovery` polish → Beat C live.

## Demo / Q&A role
You ARE the stage: run the controller, narrate Beats B and C, execute the failure tree, hold the fallback video. Q&A owner for: "is The Graph load-bearing?" (answer with the retune evidence log — query, entity ID, decision, tx hash; "unplug the subgraph and the position stops adapting"), the demo-integrity question ("what was canned?" — answer honestly: everything except the live `swap()` has a disclosed twin), and product framing. Sunday: **finalist judging session** (with Flaviano); Flavio covers the ENS booth.
