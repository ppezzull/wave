# Pietro — Data + Presentation + Pitch (P3)

Owns everything the judge sees: first-party subgraph + ENS, the social UI (feed, compose, safety card, ENS chip), demo choreography, and all submission prose. UI spec = [frontend.md](../strategy/frontend.md) — read it first.

> ### 🔑 The data-ownership rule — read before writing `/api/feed`
>
> **Privy authenticates · ENS identifies · the subgraph measures · there is no database.**
>
> The test, which is also the answer to the ENS judge: **"there is no database. Everything on the card comes from ENS or from chain."** Concretely: stop the subgraph and the cards lose their stats but keep listing; stop ENS and the feed is empty. There is no off-chain store to unplug — so the judge cannot find one, and no amount of narration is needed to hide it.
>
> | Data | Home | Why |
> |---|---|---|
> | Which strategies exist | **subgraph** (`StrategyDeployed`) | causal + load-bearing for the Graph track |
> | Intent, `programHash`, oracle band | **ENS text records** (ENSIP-26 `agent-context` is free-form) | the record structure *is* the artifact — that's the *Most Creative Use of ENS* gate |
> | Volume, fills, committed capital | **subgraph** | Graph track; also the *like* signal (see below) |
> | Author | the parent **ENS name** of the subname | free |
> | Avatar, bio, twitter | **standard ENS text records** (`avatar`, `description`, `com.twitter`) | free, and it *is* creative ENS use |
> | **Follow** graph | **ENS text record `wave.following`** on the follower's own name | a relation between two names belongs on the identity layer; squarely *Most Creative Use of ENS* ("credentials in text records"). *"If Wave disappears tomorrow, my list is still mine."* |
> | **Like** | **capital** — committed volume / fills, already on the card | same signal ("this strategy is good"), said by someone who put money behind it rather than a thumb. Zero new infra |
> | **Comment** | **cut** — no on-chain home, no beat needs it | the only human-written text left is the strategy description, already a required public field |
> | Session / embedded wallet | **Privy** ✅ | a judge can try the product without owning a wallet |
>
> **There is no Supabase, no `profiles`, no `strategies`, no `follows`/`likes`/`comments` tables.** This is the #1 decision carried to its conclusion: the layer doesn't earn its place at all, so it's removed rather than renamed. Each social verb got a better home — *follow* → an ENS record, *like* → the capital already on the card, *comment* → cut. (Issue #3.)
>
> This is not a new position: [`sponsors/ens/OVERVIEW.md`](../sponsors/ens/OVERVIEW.md) already states *"the UI/agent resolves strategies via ENS, not a local DB."* A `/api/feed` that ever joined an off-chain store for discovery contradicts a doc we already wrote. Related: both ENS prizes require **"no hard-coded values"** — a feed built from `StrategyDeployed` + an ENS resolve cannot be that, whereas a DB-seeded one reads as exactly that.
>
> **Server-actions / SSE split (carried from PR #2):** `/api/compile` and `/api/stream` stay route handlers — server actions can't carry an SSE channel. All other data I/O uses server actions. `followStrategy()` is an ENS write (`setText` on `wave.following`), not an `INSERT`. `toggleLike()` and `addComment()` **do not exist** — like is on-chain capital, comment is cut. `getFeed()` is a plain async function queried directly from the Server Component for the SSR read (becomes a server action only if a client refetch/pagination needs one).
>
> **"The post is the prompt" (constraint):** with comments gone, the strategy description is the **sole** human-written text AND it is literally the compiler input. The ENS description record must round-trip byte-for-byte into `/api/compile` — no trimming, no reflow, no normalization. A mismatch here is a compile failure, not a polish issue.
>
> ### 🔢 The ranking algorithm — `/api/feed` sorts by this, nothing else
>
> The feed is **global** (NOT follow-filtered — follows live on the profile page, not as a feed filter). It is ranked by a real algorithm, not by recency-of-creation:
>
> ```
> rank(strategy) = returnPct × recencyDecay × (1 + log2(1 + followers))
> ```
>
> | Term | Formula | Source |
> |---|---|---|
> | `returnPct` | cumulative realized+unrealized PnL ÷ committed capital | **subgraph** (`Swap` entities aggregated per `Strategy`) |
> | `recencyDecay` | `0.5 ^ (hoursSinceLastSwap / 24)` — half-life 24h | **subgraph** (last `Swap.timestamp`) |
> | `followers` | count of distinct ENS names carrying a `wave.following/<thisStrategy>` record | **subgraph** (indexes the ENS resolver's `TextChanged` events — see below) |
>
> **Why returnPct not raw PnL:** "Up 312%" ranks over "made $40k" — raw PnL is a whale leaderboard; return-percentage is the strategy-quality signal. **Why log2(followers):** a follower is a nudge, not a multiplier — the 100th follower matters less than the 1st. **Every term is sourced from the subgraph → still no database.**
>
> **⚠️ How `followers` is actually computed (don't enumerate names):** ENS resolution is forward-only — given a name you can read its records, but there is **no reverse index** from "a record value" back to "which names hold it," and no way to enumerate all ENS names. So `followStrategy()` writes a `wave.following/<strategy>` text record on the follower's name, and the subgraph **indexes the ENS resolver's `TextChanged` events** (`TextChanged(bytes32 indexed node, string indexed key, string key, string value)`, emitted on every `setText`). Follower count = distinct emitter nodes per target-strategy key. This means the subgraph indexes **two contracts** — our `StrategyRouter` **and** the Sepolia ENS Public Resolver — so the schema/mapping row below and Flaviano (who lands `graph deploy`) must reflect the second data source. Still chain-sourced, still no off-chain store.
>
> **Listing threshold:** a strategy ranks once it has **≥3 fills AND ≥1h age**; before that it is listed but **unranked** (sorted by recency only, beneath the ranked set). Stage line: *"ranked by how much it's gained, decayed by how old it is, nudged by how many follow it."*
>
> **G2 acceptance:** the feed must sort by this formula against **live Sepolia subgraph data** — a hand-set order or a raw-volume sort fails the gate.

| ☐ | Task | Person | Collab |
|---|---|---|---|
| ☐ | **No demo controller, no canned twins, no fixtures.** The feed reads **live Sepolia subgraph + live ENS** only. (See the demo outline in prose at the bottom of this file.) | Pietro | — |
| ☐ | **No schema to scaffold — there is no database.** Stand up the two data paths the feed reads from: the subgraph client (Flaviano's ABI) and the ENS resolver client (Flavio's, `getText`/`setText`). Wrap app in Privy provider (id = ENS name or `0x…`); start compliance heartbeat + prose folder | Pietro | — |
| ☐ | graph-node spike (decentralized-network-first on Sepolia; self-hosted `graph-node` only if blocked): index trivial one-event subgraph; burn down killers (Sepolia reorgs, `eth_getLogs` ranges). **Verdict at standup:** decentralized network works / needs self-hosted fallback / arm `eth_getLogs` | Pietro | → Flaviano (deploy target), Flavio (`graphDelta` depends on this) |
| ☐ | UI scaffold — Next.js App Router, SSR, **no business logic on client**. Signed-out landing (centered pane + Privy connect); signed-in 3-column feed shell (reads **live Sepolia subgraph + ENS**, no fixtures) | Pietro | — |
| ☐ | Feed card component (author + description + bytecode preview + safety badge + **return% = the like signal** (capital-backed, not a thumb) + ENS chip + **follow** + **fork**); `safetyReport` (4 numbers + hash-verify gate); `getFeed()` = storage-neutral SSR query reading **live subgraph + ENS resolve** (no fixtures). **No comment UI.** SSR first paint + 1500ms watchdog | Pietro | — |
| ☐ | Bar: walking skeleton (landing → live Sepolia feed). **G1 → merge to `main`** | Pietro | gate |
| ☐ | `/compose` split-screen (intent + bytecode + safety card + **required public description field** — the description *is* the prompt, byte-for-byte into `/api/compile`); consume Flaviano's disassembler decoder for the bytecode pane; **fork** loads an author's ENS-published spec into the composer (first-class verb) | Pietro | ← Flaviano (disassembler) |
| ☐ | Author `subgraph/{schema.graphql,mapping.ts,subgraph.yaml}` — indexes **TWO contracts**: (a) our `StrategyRouter` → `Strategy{id,programHash,ensNode}` + `Swap{amounts,cumulativeVolume}`; (b) the **Sepolia ENS Public Resolver** (`0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5`) → a `Follow{node, strategyKey, timestamp}` entity from `TextChanged` events. **Catch:** the indexed `key` topic is a keccak256 hash, so you can't prefix-filter on-chain — index all `TextChanged` events and filter `key.startsWith("wave.following/")` in the mapping (the unhashed `key` arg is available there), then aggregate distinct emitter nodes into a per-strategy `followerCount` (the ranking's third term — see the 🔢 rule above; not computable by ENS name enumeration). `graph codegen && graph build` succeeds | Pietro | → Flaviano (lands `graph deploy`; **the subgraph now has a second data source — flag this**) |
| ☐ | SSE bridge browser↔Next.js to real `/compile` (the UI's ONLY data path); `/[handle]` profile + `/s/[id]` strategy-detail pages | Pietro | ← Flavio (Rejection/retune payloads) |
| ☐ | `EnsDiscovery` chip on cards (resolve via Flavio's client, hash side-by-side, mismatch→red+TAMPERED); render Flavio's retune evidence as badge + history (entity ID, delta, decision, tx hash) | Pietro | ← Flavio (client + stream) |
| ☐ | `getFeed()` — global (NOT follow-filtered), **ranked by the formula above** (`rank = returnPct × recencyDecay × (1 + log2(1 + followers))`), reading **live Sepolia subgraph + ENS resolve**. **Follow** = ENS `wave.following/<strategy>` `setText` via server action (NOT a DB insert); **like** = the return%/capital number already on the card (no `toggleLike`); **fork** = load the author's ENS-published spec into the composer (first-class verb); **no comment UI** (the description *is* the prompt). Public descriptions on every shipped strategy (written to the ENS record, byte-for-byte). ENS chip live. **Acceptance (must be able to fail):** grep the card's data sources — every field resolves to either a subgraph entity or an ENS `getText` call; if any field can't be sourced from one of those two, it doesn't ship; AND the feed is sorted by the ranking formula (a raw-volume sort or hand-set order fails). Plus: stop the subgraph → cards lose stats but still list; stop ENS → feed is empty. **G2 → merge to `main`** | Pietro | gate |
| ☐ | **Live-Sepolia readiness check:** SwapVM + opcodes deployed on Sepolia, ≥3 real strategies registered with real ENS records (real `description`, `programHash`, oracle band), subgraph indexing real `Swapped` events on Sepolia, ENS resolve returns the seeded records. Full rehearsal of the 3-beat demo outline (bottom of file) against **live Sepolia**, no fixtures. **G3 → freeze + merge to `main`** | Pietro | wraps Flaviano's Sepolia deploy |
| ☐ | Full rehearsal against the live Sepolia seed (3–5 real strategies, real swaps, real follows — see [PROD-TESTNET.md](../strategy/PROD-TESTNET.md) §5); print failure tree ([frontend.md](../strategy/frontend.md) §7); rehearse on-stage lines. **Never debug on stage past 20s** | Pietro | demo with Flaviano |
| ☐ | Submission prose: description + how-it's-made + 3 partner write-ups + feedback (Graph write-up MUST name subgraph + endpoints + cite retune entity IDs). Then submit, choose **"Finalist and Partner Prizes"** | Pietro | — |

**Never cut:** safety-card verdict, ENS hash-verify chip, public description, live `swap()` beat, judge-triggered halt.
**Cut order:** the follow graph (`wave.following` resolve, keep the write) → x402 → Studio insurance → `EnsDiscovery` polish → Beat C live. (*Like* is never cut — it's the return%/capital number, which is core to the card; *comment* doesn't exist.)
**Dealbreaker:** the autonomous zero-click retune provably driven by a **live Sepolia subgraph entity delta** (log cites the entity ID) + a demo that never **fully** dead-airs. A time/button-triggered retune scores ~0 on the Graph judge's "effective use" weight; a stage-melt loses the finalist slot for everyone.
>
> **Honest scope of "never dead-airs":** per-beat degradation (`DEMO_LIVE=0`, canned twins) is **gone** by design — so a single failing beat is now **narrated through visibly**, not quietly downgraded (see the failure tree in [frontend.md](../strategy/frontend.md) §7: "narrate the on-screen state, move on"). What's guaranteed is only the **total-loss** floor: if the whole demo melts, the G3-recorded fallback video of the live Sepolia flow takes over. We do **not** claim a clean per-beat no-failure property the build no longer provides. (If a specific beat is judged too flaky to risk — e.g. Beat D retune on a congested network — restoring one narrow canned twin for *that beat only* is a G3 call, not the default.)
**Demo/Q&A:** you ARE the stage — narrate the beats, execute the fallback tree, hold the fallback video. Own Q&A on "is The Graph load-bearing?" (the retune evidence log — query, entity ID, decision, tx hash; "unplug the subgraph and the position stops adapting"), demo integrity ("this is all live Sepolia — no fixtures, no canned twins"), and product framing. Sunday: finalist judging session with Flaviano; Flavio covers the ENS booth.

---

### Demo outline — 3 beats against LIVE Sepolia (no fixtures, no controller)

This is a runbook note, NOT a code artifact. The feed reads live subgraph + live ENS throughout. Every beat has one rehearsed fallback path.

- **Beat A — "the post is the prompt" (≈60s).** Compose a strategy in natural language → live `/api/compile` → bytecode pane + safety card + `programHash` → `register.ts` writes the ENS record on Sepolia. **Narrate:** "the description is the prompt; the card is the proof." **Fallback (≤15s):** if the live `/compile` stalls past 1500ms, switch to a pre-warmed cached compile (disclosed: "cached, real, disclosed"), retry silently.
- **Beat B — "the like is capital" (≈90s).** A seeded strategy with real committed capital fills the card's return% (the like signal); show it ranked by the formula on the live feed; the `EnsDiscovery` chip resolves the ENS record and shows the hash matches the bytecode. **Narrate:** "no thumb — money behind it." **Fallback (≤15s):** if the ENS resolve lags, fall back to the seeded `programHash` from the record (disclosed), keep the card live.
- **Beat C — "it retunes itself" (≈90s).** A live oracle deviation on Sepolia triggers the autonomous retune; the evidence log (entity ID, delta, decision, tx hash) streams to a badge on the card; the judge sees the position adapt zero-click. **Narrate:** "unplug the subgraph and it stops adapting — that's why The Graph is load-bearing." **Fallback (≤15s):** if the live deviation hasn't fired, trigger the seeded deviation script on Sepolia (disclosed: "seeded trigger, real retune"), or play the fallback recording.
