# Pietro — Data + Presentation + Pitch (P3)

Owns everything the judge sees: first-party subgraph + Supabase, the social UI (feed, compose, safety card, ENS chip), demo choreography, and all submission prose. UI spec = [frontend.md](../strategy/frontend.md) — read it first.

| ☐ | Task | Person | Collab |
|---|---|---|---|
| ☐ | `ui/src/demo/{timeline.ts,controller.ts}` — deterministic 240s stage controller with `DEMO_LIVE=0` canned-twin switching (the ONE un-cannable call is the live `swap()`); fixtures conform to Flaviano's frozen `specVersion: 1` | Pietro | ← Flaviano (spec) |
| ☐ | Scaffold Supabase schema (`profiles`, `strategies`, `follows`, `likes`, `comments`); wrap app in Privy provider (id = ENS name or `0x…`); start compliance heartbeat + prose folder | Pietro | — |
| ☐ | graph-node spike — docker-compose graph-node + IPFS + postgres against anvil; index trivial one-event subgraph; burn down killers (instant-mine, fork-reset reorgs, `eth_getLogs` ranges). **Verdict at standup:** works / needs workarounds / arm `eth_getLogs` | Pietro | → Flaviano (deploy target), Flavio (`graphDelta` depends on this) |
| ☐ | UI scaffold — Next.js App Router, SSR, **no business logic on client**. Signed-out landing (centered pane + Privy connect); signed-in 3-column feed shell on fixtures | Pietro | — |
| ☐ | Feed card component (author + description + bytecode preview + safety badge + live stats + ENS chip + like/repost/comment); `safetyReport` (4 numbers + hash-verify gate); `/api/feed` joins Supabase + fixtures (Graph later). SSR first paint canned + 1500ms watchdog | Pietro | — |
| ☐ | Bar: walking skeleton (landing → feed of fixture cards). **G1 → merge to `main`** | Pietro | gate |
| ☐ | `/compose` split-screen (intent + bytecode + safety card + **required public description field**); consume Flaviano's disassembler decoder for the bytecode pane; wire Beat B/C into controller | Pietro | ← Flaviano (disassembler) |
| ☐ | Author `subgraph/{schema.graphql,mapping.ts,subgraph.yaml}` against Flaviano's ABI: `Strategy{id,programHash,ensNode}` + `Swap{amounts,cumulativeVolume}`. `graph codegen && graph build` succeeds | Pietro | → Flaviano (lands `graph deploy`) |
| ☐ | SSE bridge browser↔Next.js to real `/compile` (the UI's ONLY data path); `/[handle]` profile + `/s/[id]` strategy-detail pages | Pietro | ← Flavio (Rejection/retune payloads) |
| ☐ | `EnsDiscovery` chip on cards (resolve via Flavio's client, hash side-by-side, mismatch→red+TAMPERED); render Flavio's retune evidence as badge + history (entity ID, delta, decision, tx hash) | Pietro | ← Flavio (client + stream) |
| ☐ | `/api/feed` joins Supabase + live Graph subgraph; follow/like/comment live; public descriptions on every shipped strategy; ENS chip live. **G2 → merge to `main`** | Pietro | gate |
| ☐ | `make demo-up` green **twice** (cut fork→deploy→register ENS→ship→reset graph-node→fixture swaps→battery→green checklist); measure subgraph re-sync < T-15min fork-recut window; full 240s dry-run recorded; canned twins for every beat. **G3 → freeze + merge to `main`** | Pietro | wraps Flaviano's deploy targets |
| ☐ | Full rehearsal against fresh fork cut; print failure tree ([frontend.md](../strategy/frontend.md) §8); rehearse on-stage lines. **Never debug on stage past 20s** | Pietro | demo with Flaviano |
| ☐ | Submission prose: description + how-it's-made + 3 partner write-ups + feedback (Graph write-up MUST name subgraph + endpoints + cite retune entity IDs). Then submit, choose **"Finalist and Partner Prizes"** | Pietro | — |

**Never cut:** safety-card verdict, ENS hash-verify chip, public description, live `swap()` beat, judge-triggered halt.
**Cut order:** social interactions (follow/like/comment) → x402 → Studio insurance → `EnsDiscovery` polish → Beat C live.
**Dealbreaker:** the autonomous zero-click retune provably driven by a live subgraph entity delta (log cites the entity ID) + a demo that never dead-airs (every beat has a rehearsed canned twin). A time/button-triggered retune scores ~0 on the Graph judge's "effective use" weight; a stage-melt loses the finalist slot for everyone.
**Demo/Q&A:** you ARE the stage — run the controller, narrate Beats B and C, execute the failure tree, hold the fallback video. Own Q&A on "is The Graph load-bearing?" (the retune evidence log — query, entity ID, decision, tx hash; "unplug the subgraph and the position stops adapting"), demo integrity ("what was canned?" — everything except the live `swap()` has a disclosed twin), and product framing. Sunday: finalist judging session with Flaviano; Flavio covers the ENS booth.
