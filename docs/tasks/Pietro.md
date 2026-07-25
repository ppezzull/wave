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
