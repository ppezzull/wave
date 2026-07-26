# frontend.md — the UI/UX source of truth (X-style, chat-driven)

_The single source of truth for the wave frontend. **Owner: P3 (Pietro)**. An X-style authed shell with a left rail, a chat drawer to compose strategies, and live on-chain data everywhere. This doc is written to be fed to a site generator (SiteLab) in one shot — every section is concrete: routes, layout, components, states, colors, copy. Companion docs: [PROOF-OF-CAPITAL.md](./PROOF-OF-CAPITAL.md) (the thesis + the data-ownership rule), [AGENT.md](./AGENT.md) (the chat's agent backend + HITL), [Pietro.md](../tasks/Pietro.md) (the 🔢 ranking + per-field data sources)._

> **Two rules that shape everything below (carries finalist weight):**
> 1. **No business logic on the client.** The chat drawer streams to the **agent container** over `AGENT_URL` ([AGENT.md](./AGENT.md)); the UI is transport + render only. No LLM keys, no wallet keys, no direct GraphQL in the browser.
> 2. **There is no database.** Every field on every card comes from **The Graph subgraph or ENS text records** — nothing else. No chat history is stored: once a strategy ships, what persists is the **on-chain output** (the strategy + its live data), never the conversation. *Stop the subgraph → cards lose stats but still list. Stop ENS → the feed is empty. There is no off-chain store to unplug.* ([PROOF-OF-CAPITAL.md](./PROOF-OF-CAPITAL.md), [Pietro.md](../tasks/Pietro.md) 🔑).

---

## §1 — Product shape in one paragraph

wave is an **X-style social market for on-chain strategies**. A visitor lands on a marketing page; Privy signs them in; inside, a **left rail** (Explore / Follow / Followed / Profile / Settings + a **Create** CTA) navigates a product built around two things: a **global ranked feed** of live strategies, and a **chat drawer** where you describe a strategy in natural language and the agent compiles, safety-checks, registers (ENS), and ships it (Aqua on Sepolia). Strategies are the only persistent object — discovered via ENS, measured by the subgraph, ranked by real performance. *Likes are liquidity, the feed is The Graph, profiles are ENS.*

---

## §2 — Routes & auth states

X-style: a public marketing shell, then an authed app shell behind Privy.

| Route | Auth | Type | Purpose |
|---|---|---|---|
| `/` (signed-out) | No | Server Component | **Landing** — marketing (x.com-style): hero, "likes are liquidity" thesis, live feed preview, **Sign in with Privy** CTA. |
| `/` (signed-in) | Yes | Server Component | **Explore** — the global ranked feed (default authed view). |
| `/follow` | Yes | Server Component | **Follow** — strategies you follow (your `wave.following` records), live. |
| `/followed` | Yes | Server Component | **Followed** — strategies by people who follow *you* (reverse edge, subgraph-computed). |
| `/[handle]` | Yes | Server Component | **Profile** — a strategist's shipped strategies + live stats + follow graph. `handle` = ENS name. |
| `/settings` | Yes | Server Component | **Settings** — Privy wallet, ENS identity (avatar/bio/display name text records), sign out. |
| `/s/[id]` | Yes | Server Component | **Strategy detail** — one strategy, full card + bytecode + safety card + ENS hash-verify + retune evidence history. `id` = strategy ENS node. |
| `/api/compile` | — | POST route handler | The chat drawer's compile stream: description → agent → bytecode + verdict (SSE). |
| `/api/stream` | — | GET SSE route handler | The single event stream for compose/retune/HITL events proxied to the agent. |

- **No `/demo`, no `/review` page, no `/chats` page.** HITL approvals happen **inside the chat thread** (§6). Past chats are **never listed** — only their shipped outputs surface, as strategy cards from the subgraph/ENS.
- **Auth = Privy**, wallet on Sepolia. Identity = the ENS name (or `0x…`) the wallet owns. Signed-out → landing; signed-in → Explore. No separate login route; Privy opens inline from the landing CTA.
- **All routes are Server Components by default** (SSR from `getFeed()` / ENS resolve). The only client islands: the chat drawer, live event subscribers, and interactive card CTAs (follow/fork).

---

## §3 — The authed shell (left rail, X-style)

Signed-in users get a persistent **left navigation rail** + a main content column. This is the "feeling when authed inside the platform" reference: clean, high-contrast, minimal chrome, the sea gradient reserved for the single primary action.

```
┌──────────────┬───────────────────────────────────────────────────────┐
│  ◌ wave      │                                                       │
│              │                                                       │
│  🔍 Explore  │                  (route content)                       │
│  ➤ Follow    │                                                       │
│  ✺ Followed  │                                                       │
│  ◉ Profile   │                                                       │
│  ⚙ Settings  │                                                       │
│              │                                                       │
│              │                                                       │
│  ▌Create ◌▸  │  ← the one sea-gradient CTA; opens the chat drawer    │
│  ─────────   │                                                       │
│  avatar·ens  │                                                       │
└──────────────┴───────────────────────────────────────────────────────┘
```

**Left-rail items (top → bottom):**

| Item | Route | Icon | What |
|---|---|---|---|
| **wave** logo | `/` | the wave mark | brand home |
| **Explore** | `/` (authed) | magnifier | the global ranked feed |
| **Follow** | `/follow` | arrow | strategies you follow |
| **Followed** | `/followed` | sparkle | strategies by your followers |
| **Profile** | `/[me]` | person dot | your shipped strategies + identity |
| **Settings** | `/settings` | gear | wallet + ENS identity |
| **Create** | opens drawer | — | **the only sea-gradient CTA** — opens the strategy chat drawer |
| account chip | — | avatar | your ENS avatar + name (from ENS records) |

**Rail behavior:** fixed, narrow (~240px), white-on-black per §7. The **Create** button is the single gradient element in the rail — everything else is flat monochrome. The account chip at the bottom shows the ENS avatar + name.

---

## §4 — Explore (the global ranked feed)

The default authed view. SSR'd from `getFeed()` = subgraph + ENS, **ranked by a real algorithm** (not recency):

```
rank = returnPct × recencyDecay × (1 + log2(1 + followers))
```

- `returnPct` — PnL ÷ committed capital (subgraph). **This is the "like"** — the like signal, big on the card. No like button exists.
- `recencyDecay` — `0.5^(hoursSinceLastSwap/24)`, 24h half-life (subgraph).
- `followers` — distinct ENS names with a `wave.following/<strategy>` record (subgraph indexes the ENS resolver's `TextChanged` events; not computable by name enumeration — see [Pietro.md](../tasks/Pietro.md) 🔢).

**Listing rule:** ranked only if **≥3 fills AND ≥1h age**; otherwise listed **unranked** at the top (visible, not in the ranked set). *Stage line: "ranked by how much it's gained, decayed by age, nudged by follows."* The feed is **global** — not follow-filtered.

### The feed card

Each card (the atomic unit, reused on Follow / Followed / Profile / `/s/[id]`):

| Field | Source | Rendering |
|---|---|---|
| **returnPct** (headline) | subgraph | big number, `ok` if positive, `danger` if negative. **The like.** |
| committed capital · volume · fills | subgraph | small row beneath — the evidence behind the % |
| description | ENS `description` record | the literal compiler input (the "post is the prompt"). One click → fork into the chat drawer. |
| author avatar + handle | ENS (`avatar`, parent name) | top-left |
| ENS hash-verify chip | ENS `v0.programhash` vs on-chain program | `ok`/✓ if match, `danger`/"TAMPERED" if not — load-bearing |
| age / recency | subgraph (last swap) | subtle "last swap 3h ago" |

**Card CTAs (two — not three):**
- **Follow** — writes a `wave.following/<strategy>` ENS text record on *your own* name (server action `followStrategy()` → ENS `setText`). **Not a DB insert.** Toggles to Following.
- **Fork** — loads the strategy's ENS-published `description` into the chat drawer as the starting intent (the thesis verb — [PROOF-OF-CAPITAL.md](./PROOF-OF-CAPITAL.md)).

**There is no Like button and no Comment UI.** Like = the capital on the card; comment maps to nothing on-chain and is cut ([Pietro.md](../tasks/Pietro.md) 🔑).

### Clicking a card → `/s/[id]` (strategy detail)

The same card, expanded: full bytecode (tokenized `[op][len][args]` from the disassembler), the **safety card** (4 numbers + verdict), the ENS hash-verify side-by-side, and the **retune evidence history** (entity ID, delta, decision, tx hash — [AGENT.md](./AGENT.md)) as a badge + timeline.

---

## §5 — The chat drawer (compose a strategy) — the core interaction

**"Create strategy"** in the left rail opens a **slide-over drawer** (right side, ~480px, overlays the current page; the feed stays visible behind a subtle scrim). This is where the strategist talks to the agent. The drawer is the **only** path to create a strategy.

```
┌─────────────────────────────┐
│  ✕   New strategy           │   ← drawer header; ✕ closes (draft is ephemeral)
│ ──────────────────────────  │
│                             │
│  agent: What do you want    │   ← message thread (agent ↔ strategist)
│  this strategy to do?       │
│                             │
│         you: keep ETH/USDC  │
│      balanced, halt if      │
│      Chainlink deviates 1.5%│
│                             │
│  agent: ✓ parsed — here's   │   ← as the agent works, artifacts render inline:
│  the spec. Safety check…    │      spec → bytecode → safety card → register → ship
│  ┌─ safety card ───────┐    │
│  │ SAFE                 │    │
│  │ monotonicity 0       │    │
│  │ sym ≤ 3bps           │    │
│  │ guard triggers 0     │    │
│  │ skew ≤ cap           │    │
│  └──────────────────────┘    │
│                             │
│  agent: shipped ✓ tx 0x…    │   ← on ship, the strategy is live; card appears
│  ↗ eth-usdc-guarded.wave.eth│      in the feed. Chat closes; no transcript kept.
│                             │
│ ──────────────────────────  │
│ [ describe your strategy… ] │   ← input; Enter sends → /api/compile (SSE)
└─────────────────────────────┘
```

**The interaction model (all user↔agent exchanges live here — [AGENT.md](./AGENT.md)):**

1. **Strategist types intent** (NL) → streamed to `/api/compile` → agent's `composeAgent` parses to a bounded `StrategySpec` (LLM fills a form, writes no code).
2. **Compiler runs** (reject-and-rewrite): if the intent is unsafe (e.g. oracle guard ordered after skew) the agent posts a **REJECTED** message with the violated rule + the corrected diff; the strategist can accept the correction or rephrase. *The compiler refuses to ship anything unsafe — and shows you why.*
3. **Safety card renders inline** (4 numbers + verdict). Green only if all pass **and** the program hash will match the ENS record.
4. **On "ship":** the agent registers the ENS subname + `v0.programhash` + `description` (byte-for-byte), then `aqua.ship()` on Sepolia. The agent posts the tx hash + the resolved ENS name. **The strategy is now a persistent on-chain object.**
5. **Drawer closes; no chat is stored.** The strategy surfaces as a card in the feed (Explore / your Profile) once the subgraph indexes it. *The conversation was the means; the shipped strategy is the artifact.*

**"The post is the prompt" (load-bearing):** the description the strategist types is **both** the human-readable text **and** the literal compiler input, stored byte-for-byte as the ENS `description` record. No trimming, no reflow, no normalization — a mismatch is a compile failure ([Pietro.md](../tasks/Pietro.md)).

**Fork from a card:** clicking **Fork** on any feed/profile card opens this same drawer pre-filled with that strategy's ENS `description` as the starting intent.

---

## §6 — Human-in-the-loop, inside the chat thread

Per [AGENT.md](./AGENT.md): the agent runs autonomously for **retunes** (R1–R4 — never gated, zero-click, the Graph-track invariant) but **suspends for human approval** on stop/remove/changeOracleBand and genuine questions (`askHuman`). **All of these surface inside the relevant strategy's chat drawer** — there is no `/review` queue page.

When the agent needs a human, it **reopens that strategy's chat** (the strategy's ENS node is the key) and posts a message:

| Agent message | What it is | User action |
|---|---|---|
| *"This strategy's oracle has been stale 2× maxStaleness — I want to stop it. Approve?"* | `stopStrategy` (S1–S4) | **Approve / Deny** buttons inline |
| *"No swaps for 72h and it's been stopped 7d — remove it?"* | `removeStrategy` (M1) | **Approve / Deny** |
| *"Oracle band edge reached — widen the band?"* | `changeOracleBand` | **Approve / Deny** (+ proposed value) |
| *"Two valid retune directions conflict — which way?"* | `askHuman` (E1/E2/E3) | free-text reply |

- **Retunes never ask** — they post a *notification* (`"retuned ✓ — skew drifted, re-shipped. tx 0x…"`) with the evidence, no approval. The HITL set and the retune set are disjoint ([AGENT.md](./AGENT.md) posture invariant).
- **No chat transcript persists after resolution.** The approval decision is written on-chain (`wave.status=stopped`, etc.); the thread is ephemeral. The strategy card's status badge reflects the outcome.
- The drawer can reopen for an **existing** strategy (keyed by ENS node) when the agent escalates — this is the "reopen the chat with the working agent" behavior, scoped to live strategies only, **not** a chat-history list.

---

## §7 — Color system (white/black base + Lisboa sea gradient)

**Base:** white and black — a clean, high-contrast, X-style monochrome shell. The **Lisboa sea gradient** is reserved for CTAs and key accents (the Create button, the `ship()` confirm, active states). The wave brand palette (navy/teal/cream) feeds the gradient.

| Token | Value | Use |
|---|---|---|
| `bg` | `#FFFFFF` | app background (signed-in) |
| `bg-invert` | `#000000` | left rail + signed-out landing |
| `surface` | `#F7F9FA` | cards, drawer |
| `border` | `#E2E8EC` | dividers, card edges |
| `text` | `#000000` | primary text |
| `text-muted` | `#5B6B72` | labels, secondary |
| `text-invert` | `#FFFFFF` | text on black/gradient |
| `ok` | `#1F9D6B` | safety green, hash-match, positive return% |
| `danger` | `#E5484D` | REJECTED, hash mismatch, halt, negative return% |
| `warn` | `#F5A623` | "indexing"/stale chip |
| `accent` (gradient) | sea gradient (below) | **the only chromatic CTA treatment** |

**The Lisboa sea gradient** (Caravelos water column; maps onto the wave brand palette — navy seabed → teal shallows → cream foam):

```css
--sea-gradient: linear-gradient(
  135deg,
  #0F3460 0%,    /* navy — the seabed (brand outline color) */
  #2A9D8F 45%,   /* deep teal — the wave body */
  #26A69A 70%,   /* bright teal — shallows */
  #FFF3E0 100%   /* cream — the foam / surf line */
);
```

**Where the gradient is used (sparingly — it's the signal, not the noise):**
- The **Create** CTA in the left rail (filled).
- The **Ship** confirm button in the chat drawer.
- Active/selected left-rail item accent (a thin gradient bar, not a fill).
- The signed-out landing hero.

**Where it is NOT used:** body backgrounds, cards, ordinary text, borders — those stay monochrome. The whole point is that the gradient marks *the moment capital moves* (create / ship).

**Type & conventions:**
- One typeface stack: `ui-sans-serif` for chrome/copy, `ui-monospace` for bytecode, hashes, addresses, numeric/protocol values.
- Safety card: solid `ok`/`danger` bg, verdict word large (`SAFE`/`REJECTED`), 4 numbers in a row beneath.
- Bytecode tokens: monospaced; opcode byte tinted (custom opcodes get a subtle teal/sand tint), `[len]` in `text-muted`, args in `text`.
- ENS hash-verify: two columns; match → both `ok`; mismatch → both `danger` + "TAMPERED".
- Indexing/stale chip: small `warn` pill ("subgraph syncing" / "last block N ago") — honesty is a judging criterion.
- Attribution in the footer from hour 1: **"Powered by SwapVM — © Degensoft Ltd 2025"** (1inch Classic-track license).

---

## §8 — Data flow (no off-chain store)

```
 Browser  ──SSE (chat drawer)──►  Next.js  ──HTTP/SSE (AGENT_URL)──►  AGENT CONTAINER
   │                                │                                   composeAgent (NL→spec)
   │                                │                                   compiler (emit + reject)
   │                                │                                   ensAgent (register/verify/setText)
   │                                └─► /api/compile, /api/stream        retuneAgent (dock→recompile→ship)
   │                                                                     └─► Sepolia (live ship/swap)
   └── SSR (Explore/Follow/Followed/Profile/s/[id]) ◄── getFeed() + ENS resolve
                                                       = subgraph (Swapped, capital, volume, fills, followers)
                                                       + ENS (description, avatar, wave.following, v0.programhash)
```

- **Two read paths, no off-chain store.** The chat drawer is SSE from `/api/stream`, proxied to the agent. The feed/profiles are SSR via `getFeed()` + ENS resolve (served by the agent's read tools). Both resolve to **chain + ENS — no database**.
- **No client → GraphQL path.** The browser never queries the subgraph directly; the agent does.
- **The agent is its own service** ([AGENT.md](./AGENT.md)). Next.js holds no LLM/wallet keys and imports no agent modules.
- **No chat storage.** The drawer is ephemeral; persistence is the on-chain strategy, read back through the subgraph + ENS.

---

## §9 — Network, attribution, failure posture

- **Sepolia, live** — no anvil fork, no mock, no canned twins. Every shipped strategy is a real on-chain action a judge can verify on Etherscan. See [PROD-TESTNET.md](./PROD-TESTNET.md).
- **No mock fallback.** If the subgraph lags, the feed shows what's indexed (a `warn` "indexing" chip); if a compile fails, it fails visibly in the drawer. There is no `replay.json` to silently swap in.
- **Failure posture (demo):** narrate the on-screen state and move on; never debug live past ~20s. The full failure tree lives in [EVENT-RUNBOOK.md](./EVENT-RUNBOOK.md). Total-loss floor only: a G3-recorded video of the live Sepolia flow, narrated.

---

## §10 — Build windows (P3's UI slice)

| Window | UI task |
|---|---|
| **h0–2** 🔴 | Next.js App Router boot (SSR, Server Components default); Privy provider; left-rail shell (§3); signed-out landing (§2). Attribution footer. |
| **h8–10** | Explore feed + feed card (§4) reading **live subgraph + ENS**; `getFeed()` SSR ranked by the formula. |
| **h10–12** | Chat drawer (§5) wired to a **stubbed agent** (`/api/compile` returns canned `building → shipped`); safety card component. |
| **h12 = G1** 🟢 | Walking skeleton: landing → Privy → Explore (live data) → chat drawer → card in feed. **Merge to `main`.** |
| **h14–16** | Fork (load ENS description into drawer); `/s/[id]` detail; ENS hash-verify chip; bytecode pane from the disassembler. |
| **h16–20** | Wire the drawer to the **real agent** (compose → compile → reject-and-rewrite → ENS register → `ship()`); Follow/Followed pages. |
| **h20–22** | HITL inside the chat thread (§6): agent-reopened drawer for stop/remove/askHuman; retune evidence badge + history on `/s/[id]`. |
| **h22–24 = G2** 🟢 | End-to-end: chat → real ship on Sepolia → card live + ranked → autonomous retune + HITL surface. **Merge to `main`.** |
| **h28–30 → G3** 🟢 | Seed 3–5 real strategies; subgraph synced; full live dry-run recorded (= fallback video base). Freeze h30. |

**P3's personal cut order:** stub-agent drawer path first (demoable at G1 without the spine) → ENS hash-verify polish second → **never** the safety card, the live feed, the description-as-prompt, or the no-client-logic rule.

---

## §11 — Out of scope (explicit non-features)

To keep the one-shot generation honest, these are **deliberately not built**:

- **No chat history / no `/chats` route.** Past conversations are never listed or replayed. Only shipped strategies persist (as on-chain objects).
- **No `/review` queue page.** HITL lives inside chat threads (§6).
- **No Like button, no Comment UI.** Like = capital on the card; comment = cut ([Pietro.md](../tasks/Pietro.md) 🔑).
- **No settings beyond wallet + ENS identity.** No billing, no notifications center, no admin dashboard.
- **No mock/canned fallback path.** Live Sepolia only.
