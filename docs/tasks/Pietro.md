# Pietro — Data + Presentation + Pitch (P3)

## Mission
Own **everything the judge sees**: all data (first-party subgraph + Supabase), the social UI (feed, compose, safety card, ENS chip), demo choreography, and all submission prose. You build the **subgraph** that indexes `Swapped` (Flaviano deploys it; Flavio's agent consumes it), the **Supabase** social layer, and the full **X-style social product**. You do **not** own the retune decision — that's Flavio's `graphDelta`; you own the *data source* it reads and the *surface* that renders its results. Your work carries finalist **Usability + WOW** and the **Graph AI Use Case** data foundation (the subgraph that makes Graph load-bearing). You also own all prose from hour 0 (runbook rule — not "when free").

> **🌐 Your UI spec is [frontend.md](../strategy/frontend.md)** — pages, routes, feed cards, user flows, colors, the failure tree, build windows. Read it first.

## Hour-by-hour

**h0–2 — `timeline.ts` + `controller.ts` + Supabase schema + Privy 🔴**
- `srcs/requirements/ui/src/demo/{timeline.ts,controller.ts}`: the deterministic 240s stage controller with `DEMO_LIVE=0` canned-twin switching (the ONE un-cannable call is the live `swap()`). See [frontend.md](../strategy/frontend.md) §1 + §4b.
- Scaffold **Supabase** schema: `profiles` (handle, bio), `strategies` (description, author, strategy_id, created_at), `follows`, `likes`, `comments`. Wrap the app in the **Privy** provider; user id = ENS name if set, else `0x…`.
- Start the compliance heartbeat + prose folder now.

**h2–4 — graph-node spike (the data foundation risk)**
- docker-compose graph-node + IPFS + postgres against anvil; index a trivial one-event subgraph. Burn down the known killers now: anvil instant-mine vs block polling, fork-reset reorgs, `eth_getLogs` ranges. **Report a verdict at standup**: works / needs workarounds / arm the `eth_getLogs` fallback. This is the highest-variance risk on the G2 path — Flavio's retune depends on your endpoint.

**h8–10 — UI scaffold: signed-out landing + signed-in feed shell**
- `srcs/requirements/ui/` Next.js App Router, SSR, **no business logic on the client**. Signed-out landing (centered pane + Privy connect); signed-in three-column feed shell (left nav / center feed / right sidebar) on fixtures. Fixtures conform to Flaviano's frozen `specVersion: 1`. Per [frontend.md](../strategy/frontend.md) §4.

**h10–12 — feed card + `parseProgram`/`safetyReport` + `/api/feed`**
- Feed card component (author + description + bytecode preview + safety badge + live stats + ENS hash-verify chip + like/repost/comment). `safetyReport`: 4 numbers + hash-verify gate. `/api/feed` joins Supabase + fixtures (Graph later). First paint canned (SSR); 1500ms watchdog.

**h12 = G1 🟢** — bar: walking skeleton (landing → feed of fixture cards). If missed: fixture-only UI is the cut floor — protect the card and panes, drop styling.

**h14–16 — `/compose` split-screen + Beat B/C plumbing**
- `/compose`: intent + bytecode + safety card + **required public description field**. Consume Flaviano's disassembler decoder for the bytecode pane (real tokens). Beat B/C wiring into the controller (timeline §4b).

**h16 — subgraph handoff (spine)**
- Author `srcs/requirements/subgraph/{schema.graphql,mapping.ts,subgraph.yaml}` against Flaviano's h0–2 ABI: entities for Strategy (id, programHash, ensNode) + Swap (amounts, cumulativeVolume rollup). **Hand to Flaviano — he lands `graph deploy` h18–20 on the fork infra he owns.** The endpoint he returns is Flavio's `graphDelta` input + your `/api/feed` live-stats source.

**h16–20 — SSE bridge → real `/compile` + `/[handle]` + `/s/[id]`**
- Wire the browser↔Next.js SSE stream to the real compile path (the UI's ONLY data path — [frontend.md](../strategy/frontend.md) §6). Profile (`/[handle]`) + strategy-detail (`/s/[id]`) pages.

**h20–22 — `EnsDiscovery` chip + retune badge surface**
- ENS hash-verify chip on cards (resolve subname via Flavio's client, hash side-by-side, mismatch→red). Render Flavio's retune evidence stream as a "retuned" badge + history on the card (entity ID, delta, decision, tx hash).

**h22–24 = G2 🟢 — full social feed live**
- `/api/feed` now joins Supabase + the live Graph subgraph. Follow/like/comment live (Supabase). Public descriptions on every shipped strategy. G2 bar: full social feed + ENS chip live; retune badge renders from Flavio's stream.

**h24–30 → G3 (h30) 🟢 — dry runs + fallbacks**
- `make demo-up` green **twice** (cut fork → deploy → register ENS → ship → reset graph-node → fixture swaps → battery → green checklist); measure subgraph re-sync < T-15min fork-recut window. Full 240s dry-run recorded (= fallback video base). Canned twins for every beat. Freeze h30.

**h34–35 — demo run**
- Full rehearsal against a fresh fork cut; the full failure tree + on-stage lines are in [frontend.md](../strategy/frontend.md) §8 — print it. **Never debug on stage past 20 seconds.**

**Sunday 07:00–08:30** — submission prose: description, how-it's-made, 3 partner write-ups + feedback (Graph write-up MUST name the subgraph, endpoints, and cite the retune log's entity IDs — qualification requires it). 08:30–09:00 submit; choose **"Finalist and Partner Prizes"**.

## Definition of Done — checks & tests per step

| Step (hours) | What "done" looks like — checks & tests |
| --- | --- |
| h0–2 | `make demo-up` green (the end-to-end world builder); deterministic 240s controller runs with `DEMO_LIVE=0` canned twins AND `DEMO_LIVE=1`; the ONE un-cannable call is the live `swap()`; Supabase schema migrated (`profiles, strategies, follows, likes, comments` tables exist — `supabase db dump` confirms); compliance heartbeat + prose folder created |
| h2–4 | graph-node spike verdict reported at standup: "works" / "needs workarounds" / "arm eth_getLogs fallback"; trivial one-event subgraph indexes against anvil; docker-compose graph-node + IPFS + postgres runs without errors |
| h8–10 | UI scaffold passes `next build`; signed-out landing renders centered pane + Privy connect; signed-in three-column feed shell renders (left nav / center feed / right sidebar) on fixtures; fixtures conform to Flaviano's frozen `specVersion: 1`; SSR first paint confirmed |
| h10–12 | Feed card component renders all fields (author + description + bytecode preview + safety badge + live stats + ENS chip + like/repost/comment); `safetyReport` returns 4 numbers + hash-verify gate; `/api/feed` joins Supabase + fixtures; first paint is canned/SSR; 1500ms watchdog fires to cached-but-real |
| h12 = G1 | Walking skeleton complete: landing → feed of fixture cards end-to-end; fixture-only UI confirmed as cut floor if behind |
| h14–16 | `/compose` split-screen renders (intent + bytecode + safety card + required public description field); bytecode pane shows real tokens from Flaviano's disassembler (decode(emit(ir))===ir); Beat B/C plumbing wired into controller |
| h16 | `srcs/requirements/subgraph/{schema.graphql,mapping.ts,subgraph.yaml}` authored; schema has `Strategy{id,programHash,ensNode}` + `Swap{amounts,cumulativeVolume}`; `graph codegen && graph build` succeeds; handoff to Flaviano confirmed |
| h16–20 | SSE bridge working between browser↔Next.js; `/compile` endpoint wired to real compile path; `/[handle]` profile page renders; `/s/[id]` strategy-detail page renders; UI's only data path confirmed |
| h20–22 | `EnsDiscovery` chip on cards: on match both hashes render green; on mismatch both flip red with TAMPERED tag; retune badge renders from Flavio's stream (entity ID, delta, decision, tx hash) |
| h22–24 = G2 | `/api/feed` joins Supabase + live Graph subgraph; follow/like/comment live via Supabase; public descriptions on every shipped strategy; full social feed + ENS chip live; retune badge renders from Flavio's stream |
| h24–30 → G3 | `make demo-up` green twice (cut fork → deploy → register ENS → ship → reset graph-node → fixture swaps → battery → green checklist); subgraph re-sync measured < T-15min fork-recut window; full 240s dry-run recorded (= fallback video base); every beat has a canned twin; freeze at h30 |
| h34–35 | Demo run completed against fresh fork cut; failure tree printed from [frontend.md](../strategy/frontend.md) §8; on-stage lines rehearsed; 20-second debug limit confirmed |
| Sunday 07:00–08:30 | Submission prose complete: description + how-it's-made + 3 partner write-ups; Graph write-up names the subgraph + endpoints + cites retune log entity IDs; submit with "Finalist and Partner Prizes" selected |

## Step-by-step build ladder & merge points

| Step | Hours | What ships | DoD check (gates it) | Branch → merge point |
| --- | --- | --- | --- | --- |
| S1 | h0–2 | `timeline.ts` + `controller.ts` + Supabase schema + Privy wrap + prose folder | `make demo-up` green; deterministic 240s controller; `supabase db dump` confirms tables | `feat/pietro-data-ui` → merge at h0 sync |
| S2 | h2–4 | graph-node spike + verdict | Spike verdict at standup; docker-compose runs | `feat/pietro-data-ui` → continue |
| S3 | h8–10 | UI scaffold (landing + feed shell) + fixtures | `next build` passes; SSR first paint confirmed; fixtures conform to `specVersion: 1` | `feat/pietro-data-ui` → continue |
| S4 | h10–12 | Feed card + `parseProgram`/`safetyReport` + `/api/feed` | Feed card renders all fields; 1500ms watchdog confirmed | `feat/pietro-data-ui` → merge at G1 (h12) |
| S5 | h14–16 | `/compose` split-screen + Beat B/C plumbing | Bytecode pane shows real tokens; decode(emit(ir))===ir | `feat/pietro-data-ui` → continue |
| S6 | h16 | Subgraph handoff (`schema.graphql` + `mapping.ts` + `subgraph.yaml`) | `graph codegen && graph build` succeeds; handoff to Flaviano confirmed | `feat/pietro-data-ui` → merge at checkpoint |
| S7 | h16–20 | SSE bridge + `/compile` + `/[handle]` + `/s/[id]` | SSE working; all three routes render | `feat/pietro-data-ui` → continue |
| S8 | h20–22 | `EnsDiscovery` chip + retune badge surface | Green on match; red+TAMPERED on mismatch; badge renders entity ID/delta/decision/tx hash | `feat/pietro-data-ui` → merge at G2 (h24) |
| S9 | h24–30 | Dry runs + fallbacks + re-sync measurement | `make demo-up` green twice; subgraph re-sync < T-15min; 240s dry-run recorded | `feat/pietro-data-ui` → merge at G3 (h30) |
| S10 | h34–35 | Demo run rehearsal | Failure tree printed; 20s debug limit | `feat/pietro-data-ui` → continue |
| S11 | Sunday 07:00–08:30 | Submission prose complete | Description + how-it's-made + 3 partner write-ups; Graph write-up with subgraph/endpoints/entity IDs | `feat/pietro-data-ui` → final merge at submission |

Feature branch commits continuously; merges to `main` only at checkpoints (h0/G1/G2/G3).

## BLOCKERS / DEPENDENCIES ON OTHERS

**You need:**
- **From Flaviano:** `StrategyDeployed` ABI at **h2** (your mapping); frozen Zod spec v1 at **h2** (your fixtures); deployed subgraph endpoint + first real `Swapped` entity at **h18–20** (your `/api/feed` live stats); live `_oracleGuard2D` + MockAggregator control at **h20–22** (your judge-triggered Beat B); the disassembler decoder at **h14–16** (your bytecode pane).
- **From Flavio:** the typed `Rejection`+diff payload + retune event stream at **h22–24** (your red card + retune badge); the ENS-resolution client for `EnsDiscovery` at h20–22.

**You owe:**
- **To Flaviano:** running graph-node from your **h2–4** spike (his h18–20 deploy target); `schema.graphql` + `mapping.ts` + `subgraph.yaml` by **h16**; `make demo-up` wrapping his deploy targets by G2.
- **To Flavio:** the deployed subgraph endpoint + first `Swapped` entity at **h18–20** (his `graphDelta` — the hard G2 gate); the card/SSE contract by **h16–18** (so his payloads render); the `EnsDiscovery` surface at h20–22.

## Dealbreaker
**A social feed that never dead-airs** (every beat has a rehearsed canned twin), **public descriptions on every strategy**, the **live `swap()` beat**, the **ENS hash-verify chip**, and the **judge-triggered halt**. A stage-melt with no fallback loses the finalist slot for everyone; a feed that doesn't render Flavio's retune evidence undermines the Graph track.

## Scope-cut floor
Signed-out landing + signed-in feed of fixture cards + `/compose` split-screen + green/red safety card; `eth_getLogs` delta (via Flavio's fallback) labeled honestly. **Never cut:** the safety-card verdict, the ENS hash-verify chip, the public description, the live `swap()` beat, the judge-triggered halt. First cuts, in order: social interactions (follow/like/comment) → x402 → Studio insurance → `EnsDiscovery` polish → Beat C live.

## Demo / Q&A role
You ARE the stage: run the controller, narrate Beats B and C, execute the failure tree, hold the fallback video. Q&A owner for: "is The Graph load-bearing?" (point to Flavio's retune evidence rendered on the card — query, entity ID, decision, tx hash), the demo-integrity question ("what was canned?" — answer honestly: everything except the live `swap()` has a disclosed twin), and product framing. Sunday: **finalist judging session** (with Flaviano); Flavio covers the ENS booth.
