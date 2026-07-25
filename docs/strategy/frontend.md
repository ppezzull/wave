# frontend.md — the UI spec (pages, routes, data, flows, technicalities)

_The UI spec — pages, routes, panes, data flow, colors, the demo beats, the failure tree, and build windows. **Owner: P3 (Pietro)** — owns the Next.js SSR UI, demo choreography, and all submission prose. This is the single source of truth for the frontend. Companion docs: [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md), [PITCH.md](./PITCH.md), [EVENT-RUNBOOK.md](./EVENT-RUNBOOK.md), and [Pietro.md](./Pietro.md)._

> **Hard rule (carries finalist weight):** the UI owns **no business logic on the client**. The agent (compiler, `resolveVerify`, `graphDelta`, MCP tools, z.ai) runs in **its own container** — see [AGENT.md](./AGENT.md) — and the Next.js server reaches it over `AGENT_URL=http://agent:3002` (HTTP/SSE). The browser receives one stream of events from the server, proxied to the agent — it never calls the LLM, never holds API keys, never queries GraphQL directly. The agent is the single subgraph client; LLM + wallet keys never live in the UI process.

---

## §1 — Stack & technicalities

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router, SSR)** | SSR keeps the LLM call, API keys, and `/compile` invocation server-side. The feed SSR-renders from `getFeed()` (subgraph + ENS) on first paint. |
| Rendering | **Server Components default**; client only for live event subscribers | No business logic on the client. |
| Agent transport | **SSE (browser ↔ Next.js)** for `/api/compile` + `/api/stream`; Next.js ↔ agent over `AGENT_URL` (HTTP/SSE); `getFeed()` is a plain async fn for SSR that calls the agent | The agent **is** a separate service (its own container). Next.js is a thin proxy: it streams the browser's compose/retune events to the agent and reads the feed from the agent's subgraph+ENS tools at render. No business logic in the UI process — only transport. |
| Network | **Sepolia** (live) — no anvil fork, no mock. See [PROD-TESTNET.md](./PROD-TESTNET.md). | Every demo moment is a real on-chain action a judge can verify on Etherscan. |
| Attributions | **"Powered by SwapVM — © Degensoft Ltd 2025"** in the UI footer from hour 1 | 1inch license compliance (Classic track). |

**Files (real repo paths):** `srcs/requirements/ui/src/` — Next.js App Router. Key modules: `app/page.tsx` (the feed, SSR via `getFeed()`), `app/[handle]/page.tsx` (profile), plus the compose panes/cards below. The agent lives in `srcs/requirements/agent/` (its own container); the UI never imports agent modules — it calls them over `AGENT_URL`. No business logic is duplicated into the UI.

**Scope-cut floor:** three panes + green/red card rendering from live subgraph+ENS data. **Never cut:** the safety-card verdict, the `EnsDiscovery` pane, the live on-chain `ship()`/`swap()`, the global ranked feed.

---

## §2 — Pages & routes

Minimal — this is a real product, not a multi-page app. Three routes:

| Route | Type | Purpose |
|---|---|---|
| `/` | **Server Component** | The product: the **global ranked feed** of strategies (SSR via `getFeed()` = subgraph + ENS), with the split-screen compose surface. Default landing. |
| `/[handle]` | **Server Component** | A strategist's profile: their strategies + their follow graph (`follows N / followed by M`, both resolved from ENS `wave.following` records). |
| `/api/compile` | **Route handler (POST)** | Server-side: the description (which IS the compiler input — see "post is the prompt" below) → Zod spec → compiler → emits bytecode + `Rejection`/verdict. Streamed back via SSE. |
| `/api/stream` | **Route handler (GET, SSE)** | The UI's single event stream for the compose/retune flow: agent emits compile verdict, bytecode tokens, safety-card numbers, ENS resolution, retune events. |

No `/demo`, no auth dashboard, no settings page — the demo runs against **the live `/` route on Sepolia**, not a separate controller-driven page. If a judge asks "where's the rest," the answer is *"this IS the product — strategy authoring for the Aqua era"* ([PITCH.md](./PITCH.md) one-liner).

---

## §3 — The compose surface (on `/`) — the panes

The split-screen that earns **Usability** (finalist criterion) and the WOW beat. Four panes + the ENS discovery pane = five total:

```
┌─────────────────────────┬─────────────────────────┐
│  LEFT — Intent          │  RIGHT — Bytecode       │
│  NL sentence input      │  emitted program,       │
│  + canonical block list │  tokenized [op][len][args]│
│  (deadline→…→salt order)│                         │
├─────────────────────────┴─────────────────────────┤
│  BOTTOM — Safety card (green/red)                 │
│  4 numbers from quote() battery + hash-verify      │
├───────────────────────────────────────────────────┤
│  5TH — EnsDiscovery pane (full width, below)       │
│  subname → programHash vs on-screen bytecode       │
└───────────────────────────────────────────────────┘
```

### Pane: LEFT — Intent
- **NL intent input** (text field / chat-style box) → POSTs to `/api/compile`.
- **The post is the prompt (load-bearing constraint):** the description the strategist types here is BOTH the human-readable strategy text AND the literal compiler input. It must round-trip **byte-for-byte** into `/api/compile` and is stored verbatim as the ENS `description` text record. No separate "label" + "intent" fields — one string, two roles. This is what makes the feed self-describing and the strategy reproducible from its ENS record alone.
- **Canonical block list** rendered after compile: the ordered blocks `Deadline → Concentrate → Decay → OracleGuard → InventorySkew → MakerFee → ProtocolFee → Curve → Salt`.
- **The WOW beat lives here:** typing a malicious intent (oracle-guard placed *after* skew) → the compiler visibly **REJECTS** it → a **red card** cites the violated rule (`OracleGuardMustPrecedeSkew`), shows an **AST move-arrow** (the canonical reorder), and emits the **corrected, canonicalized program** with a **side-by-side unified diff**. *"The compiler refuses to ship anything unsafe — and shows you why."*

### Pane: RIGHT — Bytecode
- The emitted program, tokenized into **`[op:1 byte][len:1 byte][args:len bytes]`** triples — real tokens from Flavio's **disassembler decoder** (delivered h14–16). Consume the decoder output directly; one artifact serves both this pane and the "is it really a compiler?" Q&A.

### Pane: BOTTOM — Safety card (green/red)
- **Green only if ALL pass AND program hash matches the ENSIP-25 record.**
- Pulls **4 numbers** from the `quote()` simulation battery:
  1. **monotonicity** — 0 violations
  2. **exactIn/exactOut symmetry** — max bps drift
  3. **oracle-guard trigger count**
  4. **skew penalty ≤ cap**

### Pane: 5TH — `EnsDiscovery` (the ENS-prize evidence pane)
- Resolves the strategy **subname** live (e.g. `eth-usdc-guarded.wave.eth`).
- Shows **`programHash`** (from the ENS `v0.programhash` text record) **vs the on-screen bytecode**, **side-by-side**.
- **Mismatch → turns red** (the ENS hash-verify negative path, shown live). *"The taker found this strategy through ENS — there is no database — and checked it wasn't tampered with."* This is what makes ENS load-bearing, not cosmetic.

---

## §3.5 — The feed (on `/`) — global, ranked, no DB

The `/` route is not just the compose surface; it's also a **global X-style feed of every live strategy**, SSR'd from `getFeed()` (subgraph + ENS). This is the social product.

**Ranking (the algorithm, all terms from chain or ENS — no DB):**

```
rank = returnPct × recencyDecay × (1 + log2(1 + followers))
```

- **returnPct** — PnL ÷ committed capital, from the subgraph. *Return %, not raw PnL* — so a small strategy that 3x'd beats a huge one that barely moved. **This is the "like" signal:** the capital on the card IS the endorsement. There is no like button.
- **recencyDecay** — `0.5^(hoursSinceLastSwap/24)`, half-life 24h. A strategy that hasn't traded in a week fades.
- **followers** — count of distinct ENS names carrying a `wave.following/<strategy>` record. **Not resolvable by name enumeration** (ENS is forward-only; you can't list all names or reverse-lookup a record value). Instead the subgraph **indexes the ENS resolver's `TextChanged` events** and aggregates per target strategy — so this term comes from the subgraph like the other two, not from any off-chain store. (Side effect: the subgraph indexes two contracts — our router + the Sepolia ENS Public Resolver.)

**Listing:** a strategy is **ranked** only if ≥3 fills AND ≥1h age; otherwise it's listed **unranked** at the top of /new (visible, but not in the ranked feed). *Stage line: "ranked by how much it's gained, decayed by age, nudged by follows."*

**The feed is GLOBAL — not follow-filtered.** Everyone sees the same ranked feed. Follows are a personal graph that lives on the profile page (`/[handle]`), not a filter on `/`.

### The feed card

Each card shows:

- **returnPct** as the headline number (the "like signal") — big, `ok`-colored if positive, `danger` if negative.
- **committed capital, volume, fills** — from the subgraph (the evidence behind the return %).
- **description** — the literal compiler input (ENS `description` record), one click from re-loading into the composer.
- **avatar + strategist handle** — from ENS.
- **ENS hash-verify chip** — `ok` if `v0.programhash` matches the on-chain program, `danger` ("TAMPERED") if not. Load-bearing, same component as the §3 `EnsDiscovery` pane.
- **recencyDecay** as a subtle age indicator (e.g. "last swap 3h ago").

**Card CTAs (two — not three):**
- **Follow** — a single ENS write: adds a `wave.following/<strategy>` text record on the *follower's* own ENS name. Server action (`followStrategy()`). Increments the `followers` term in everyone's rank. **There is no Like button and no Comment UI** — like *is* the capital on the card, comment maps to nothing on-chain and is cut (see [README.md](../../README.md) "No database" callout).
- **Fork** — first-class: loads the strategy's ENS-published spec (the `description` record, byte-for-byte) into the composer as the starting intent, so a strategist can branch and re-compile. Promoting fork is intentional — it's the social verb that compounds the compiler.

---

## §4 — The demo flow (live on `/`, Sepolia) — beats, not a controller

There is **no `/demo` route, no 240s controller, no canned twins, no `DEMO_LIVE=0`**. The demo is a human driving the live product on `/` against real Sepolia state — strategies seeded before the event (see [PROD-TESTNET.md](./PROD-TESTNET.md) §5), real capital, real swaps, real indexing. Every beat is a real on-chain action the judges can verify on Etherscan.

| Beat | What the UI shows | Live on-chain truth |
|---|---|---|
| **A — the feed** | `/` SSR-renders the **global ranked feed** from `getFeed()`; the seeded strategies appear ranked by returnPct × recencyDecay × (1 + log2(1 + followers)). *"Ranked by how much it's gained, decayed by age, nudged by follows."* | subgraph `Swapped` events + ENS records on Sepolia |
| **B — compose + ship** | Type a description (the compiler input) → split-screen bytecode → green safety card → **live `StrategyFactory` deploy + `aqua.ship()` on Sepolia**. The strategy appears in the feed once indexed. | real deploy tx, real `ship()` |
| **C — ENS-discover + judge-triggered halt** | Click a card → ENS hash-verify chip proves `v0.programhash` matches. Judge picks a deviated oracle state → **`_oracleGuard2D` HALTS quoting on screen** (red). *"The protection lives in the VM — nothing the AI did could disable it."* | ENS resolution; real on-chain guard revert |
| **D — autonomous retune** | A real subgraph entity delta crosses threshold → agent notices → `dock()` + recompile + `ship()` on Sepolia, **autonomously, no click**. *"Your LP position just adapted itself."* | real retune txs |

**Stage discipline:** no canned twins to fall back to — every beat is live. **Cut plan if something breaks:** narrate the already-on-screen state and move on; never debug on stage past ~20s (see §7). The rubric-killer beats are B (live `ship()`), C (the halt), and D (autonomous retune) — but the feed itself (A) is now a beat too, since it's real ranking of real data.

> **⚠️ Beat D autonomy boundary (the 35% question):** *"Is it really autonomous, or time-triggered?"* is the deciding question on the Graph track's "effective use" weight, and our own docs name a time-triggered retune as the 9→10 miss. The boundary, stated so a sharp judge can't probe it: **the retune transaction may be *sent* early** (to absorb Sepolia's ~12s block latency — purely a timing optimization) **but it may NEVER be *built* before the threshold-crossing decision exists.** The decision (delta-cross detected from the subgraph entity) precedes the tx construction; only the broadcast may be nudged earlier than the narration. If challenged, the retune evidence log proves the ordering: query timestamp → decision → tx hash, with the decision timestamp strictly before tx construction.

> **Safety narrative:** build the protection story on the **oracle clamp** (`_oracleGuard2D`, which fires routinely in live pools) rather than a heal-side discount — the heal-side reward is ~0 in the tested regime. See [PITCH.md](./PITCH.md).

---

## §5 — Data flow (the one diagram that matters)

```
 Browser (/, /[handle])  ──SSE (compose)──►  Next.js server  ──HTTP/SSE (AGENT_URL)──►  AGENT CONTAINER
      │                                            │                                    compiler (emit + reject)
      │                                            │                                    resolveVerify (ENS)
      │                                            │                                    graphDelta (subgraph)
      │                                            └─►  /api/compile (POST)              └─►  Sepolia (live ship/swap)
      │
      └── SSR feed (/) ◄── getFeed() = subgraph (Swapped, capital, volume, fills)
                                 + ENS (description, avatar, wave.following, v0.programhash)
```

- **Two read paths, no off-chain store.** The compose/retune flow is SSE from `/api/stream`, proxied to the agent; the feed is SSR via `getFeed()` (subgraph + ENS), served by the agent. Both resolve to **chain + ENS — no database**.
- **No client → GraphQL path.** The browser never queries the subgraph directly; the agent does.
- **The agent is its own service.** Next.js is a thin transport layer — it holds no LLM/wallet keys and imports no agent modules. Everything past it lives in the agent container ([AGENT.md](./AGENT.md)).
- **No mock fallback.** If the subgraph lags, the feed shows what's indexed (disclosed via a `warn` "indexing" chip); if a compose call fails, it fails visibly. There is no `replay.json` to silently swap in.

---

## §6 — Suggested color system

A dark, Atlantic-adjacent palette tuned to the colors of **Carcavelos beach** (Lisboa) — the product reads as a *compiler for traders*, so it should feel like a code tool with live-market accents, but the chrome is the Lisbon sea at dusk: deep ocean for backgrounds, turquoise shallows for brand. WCAG-AA contrast against the dark backgrounds.

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#01293A` | App background (deep Atlantic, darkest of the sea) |
| `bg-surface` | `#024055` | Pane / card backgrounds (deep-ocean blue) |
| `bg-surface-2` | `#006994` | Raised surfaces, the bytecode pane (mid-depth ocean blue) |
| `border` | `#0A6E8C` | Pane borders, dividers (shallow-sea edge) |
| `text-primary` | `#EAF6FB` | Primary text (sunlit foam white) |
| `text-muted` | `#8FD2E6` | Labels, secondary text, token lengths (sea-spray blue) |
| `accent-brand` | `#48D1CC` | Brand/links, the live `ship()` action, AST move-arrows (Caravelos turquoise) |
| `ok` (green card) | `#7FE3B0` | Safety card green, hash-match, monotonicity pass (sunlit sea-glass) |
| `danger` (red card) | `#FF6B6B` | REJECTED card, hash mismatch, halt, oracle-guard trigger (sunset coral) |
| `warn` | `#FFD66B` | Cached/fallback badge ("disclosed cached"), stale-state hints (beach-flag yellow) |
| `opcode-skew` | `#B5A0FF` | `_inventorySkew2D` token accent (lisbon azulejo lilac) |
| `opcode-guard` | `#FFB088` | `_oracleGuard2D` token accent (sunset sand peach) |

**Sea gradient** — a vertical gradient that reads as the Caravelos water column from seabed to surf line. Use it on hero/backdrop surfaces, the safety-card frame, and the `ship()` CTA hover. It descends through four depth stops so it works as a tall backdrop (full-screen hero) or compressed (a button):

```css
/* `--sea-gradient` — deep Atlantic → turquoise shallows → foam */
--sea-gradient: linear-gradient(
  180deg,
  #01293A 0%,    /* bg-base — the seabed / deepest water */
  #024055 28%,   /* bg-surface — deep-ocean blue */
  #006994 58%,   /* bg-surface-2 — mid-depth ocean */
  #0A6E8C 78%,   /* border — shallow-sea edge */
  #48D1CC 93%,   /* accent-brand — Caravelos turquoise, where light breaks the surface */
  #AFEEEE 100%   /* pale aqua — the surf line */
);
```

Stops map 1:1 onto the palette tokens above, so any later token retune keeps the gradient consistent. A horizontal `90deg` variant reads as the sea meeting the shore (left = deep water, right = foam) — use it for the app header strip and progress/depth bars. For a flatter, calmer surface (subtle section dividers) drop the last two stops and end at `#0A6E8C`. Keep text off the bottom ~15% (the turquoise→foam band) unless it sits on a `bg-surface` chip — contrast fails there.

**Conventions:**
- **Safety card** = solid `ok` or `danger` background with the verdict word large (`SAFE` / `REJECTED`); the 4 numbers in a row beneath.
- **Bytecode tokens** = monospaced (`ui-monospace`); opcode byte tinted by its accent (`opcode-skew`/`opcode-guard` for our two custom opcodes, `text-muted` for the rest), `[len]` in `text-muted`, args in `text-primary`.
- **Reject-and-rewrite diff** = standard unified-diff coloring: removed lines `danger`-tinted bg (`rgba(255,107,107,.12)`), added lines `ok`-tinted bg (`rgba(127,227,176,.12)`); the AST move-arrow in `accent-brand`.
- **`EnsDiscovery`** = two hash columns; on match both render `ok`, on mismatch both flip `danger` with a "TAMPERED" tag.
- **Indexing/lag badge** = small `warn`-colored chip ("subgraph syncing" / "last block N ago") when the feed is reading behind chain head — honesty is a judging criterion. (No "cached" chip anymore: there is no canned path.)

> Keep it to **one typeface stack**: `ui-sans-serif` for chrome/labels, `ui-monospace` for bytecode, hashes, and any numeric/protocol value. No more than two weights per family.

---

## §7 — Failure tree (rehearse, print for stage)

No canned twins means no silent fallback — every failure is narrated honestly. The mitigation is always "narrate the on-screen state, move on," never "swap to a fake."

| Failure | UI response | Line |
|---|---|---|
| **LLM/`/compile` flakes (Beat B)** | Retry silently once; if it still fails, narrate the partially-compiled state and skip to the next beat. Pre-warm the model before the demo. | "the model is warming — here's the seeded feed while it loads." |
| **x402 / Graph query hiccups (Beats A, D)** | Env-var swap to a backup API key (rehearsed). The feed keeps rendering from whatever the subgraph has indexed. | "falling back to our backup indexer key." |
| **Sepolia RPC dies / congested** | Swap to backup RPC (Alchemy ↔ Infura) ≤15s while narrating the on-screen feed. | narrate; never dead-air. |
| **Subgraph lag (Beat D retune)** | If the subgraph is behind, fall back to a direct `eth_getLogs` poll for the retune trigger; show the "indexing" `warn` chip. | "the subgraph's catching up — reading the logs directly." |
| **Oracle staleness fires spuriously (Beat C)** | That IS the circuit breaker working — narrate honestly. | "that's the halt doing its job." |
| **Tx reverts / nonce gap** | Use a private mempool (Alchemy/Infura `protect`); keep a 2nd funded wallet with pre-warmed nonces ready. | "replaying on the backup wallet." |
| **Total demo loss** | Pre-recorded fallback video of the live Sepolia flow (recorded at G3), narrated live. Never debug on stage past 20 seconds. | — |

---

## §8 — Build windows (P3's UI slice, from the Gantt)

| Window | UI task |
|---|---|
| **h0–2** 🔴 | Sepolia setup gated on P1: confirm Aqua + router + factory deployed, faucet wallets funded (see [PROD-TESTNET.md](./PROD-TESTNET.md) §4–5). UI scaffolding can start in parallel. |
| **h8–10** | UI scaffold: Next.js App Router, SSR, compose panes (left/right/bottom) + the global feed route `/`. |
| **h10–12** | `parseProgram` + `safetyReport`: safety card pulls the 4 numbers; verdict green only if all pass + hash matches. `getFeed()` SSR from subgraph+ENS. |
| **h12 = G1** 🟢 | Walking skeleton: feed renders live Sepolia data; compose → bytecode → safety card against the live compiler. |
| **h14–16** | Consume Flavio's disassembler decoder for the bytecode pane (real tokens); Follow (ENS write) + Fork (load ENS description into composer) CTAs on the card. |
| **h16–20** | SSE bridge → real `/compile` + `/api/stream`; deploy via `StrategyFactory` on Sepolia end-to-end. |
| **h20–22** | `graphDelta` + `EnsDiscovery` pane (resolves subname live, hash side-by-side, mismatch→red); profile page `/[handle]` with follows/followed-by from ENS. |
| **h22–24 = G2** 🟢 | Autonomous retune wired to Beat D; retune evidence log rendered in UI (query, entity ID, delta, decision, tx hash). |
| **h28–30 → G3** 🟢 | Seed 3–5 real strategies on Sepolia (real descriptions, real capital, real swaps, real follows — see PROD-TESTNET §5); subgraph fully synced; full live dry-run recorded (= fallback video base). Freeze h30. |
| **h34–35** | Demo run: full rehearsal against live Sepolia; print the failure tree. |

**P3's personal cut order:** decentralized-Graph-on-Sepolia decision (G1) first → `EnsDiscovery` polish second → **never** the retune, the safety card, or the live feed.
