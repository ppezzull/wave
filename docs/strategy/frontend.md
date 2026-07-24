# frontend.md — the UI spec (pages, routes, data, flows, technicalities)

_The UI spec — pages, routes, panes, data flow, colors, the demo beats, the failure tree, and build windows. **Owner: P3 (Pietro)** — owns the Next.js SSR UI, demo choreography, and all submission prose. This is the single source of truth for the frontend. Companion docs: [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md), [PITCH.md](./PITCH.md), [EVENT-RUNBOOK.md](./EVENT-RUNBOOK.md), and [Pietro.md](./Pietro.md)._

> **Hard rule (carries finalist weight):** the UI owns **no business logic on the client**. The compiler, `resolveVerify`, and `graphDelta` are libraries imported in-process by the Next.js server (API routes / server actions). The browser receives one stream of events from the server agent — it never calls the LLM, never holds API keys, never queries GraphQL directly. The agent is the single subgraph client.

---

## §1 — Stack & technicalities

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router, SSR)** | SSR keeps the LLM call, API keys, and `/compile` invocation server-side. First paint can render a canned card before the live compile returns (the latency fallback). |
| Rendering | **Server Components default**; client only for live event subscribers | No business logic on the client. |
| Agent transport | **SSE (browser ↔ Next.js)** — the UI's ONLY data path | No separate service, no inter-service IPC. The UI consumes the server agent's event stream; it never queries GraphQL itself. |
| Live-data fallback | `DEMO_LIVE=0` swaps any live call for its canned `replay.json` twin | Every beat has a replay twin except the one un-cannable call: the **live `swap()`**. |
| Watchdog | **1500ms** — a stalled live stream silently swaps to `replay.json` | Disclosed as "cached," never dead-air. |
| Attributions | **"Powered by SwapVM — © Degensoft Ltd 2025"** in the UI footer from hour 1 | 1inch license compliance (Classic track). |

**Files (real repo paths):** `srcs/requirements/ui/src/` — Next.js App Router. Key modules: `demo/{timeline.ts, controller.ts}` (the deterministic 240s stage controller), plus the panes/cards below. Agent modules (`compiler`, `resolveVerify`, `graphDelta`) are imported in-process server-side, not duplicated in the UI.

**Scope-cut floor:** three panes + green/red card from fixture JSON only. **Never cut:** the safety-card verdict, the `EnsDiscovery` pane, the live `swap()` beat, the judge-triggered halt.

---

## §2 — Pages & routes

Minimal — this is a demo product, not a multi-page app. Two routes:

| Route | Type | Purpose |
|---|---|---|
| `/` | **Server Component** | The product: the split-screen strategy authoring surface. Default landing. |
| `/demo` | **Client Component (controller-driven)** | The 4-minute judged demo: the deterministic 240s stage controller runs the three beats against a fresh fork. Has a `?replay=1` (and `DEMO_LIVE=0` env) mode for canned playback. |
| `/api/compile` | **Route handler (POST)** | Server-side: NL intent → Zod spec → compiler → emits bytecode + `Rejection`/verdict. Streamed back via SSE. |
| `/api/stream` | **Route handler (GET, SSE)** | The UI's single event stream: agent emits compile verdict, bytecode tokens, safety-card numbers, ENS resolution, retune events. |

No auth, no dashboard, no settings page — out of scope for the 36h. If a judge asks "where's the rest," the answer is *"this IS the product — strategy authoring for the Aqua era"* ([PITCH.md](./PITCH.md) one-liner).

---

## §3 — The authoring surface (`/`) — the panes

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
- **Canonical block list** rendered after compile: the ordered blocks `Deadline → Concentrate → Decay → OracleGuard → InventorySkew → MakerFee → ProtocolFee → Curve → Salt`.
- **The WOW beat lives here:** typing a malicious intent (oracle-guard placed *after* skew) → the compiler visibly **REJECTS** it → a **red card** cites the violated rule (`OracleGuardMustPrecedeSkew`), shows an **AST move-arrow** (the canonical reorder), and emits the **corrected, canonicalized program** with a **side-by-side unified diff**. *"The compiler refuses to ship anything unsafe — and shows you why."*

### Pane: RIGHT — Bytecode
- The emitted program, tokenized into **`[op:1 byte][len:1 byte][args:len bytes]`** triples — real tokens from Flavio's **disassembler decoder** (delivered h14–16), not fixtures. Consume the decoder output directly; one artifact serves both this pane and the "is it really a compiler?" Q&A.

### Pane: BOTTOM — Safety card (green/red)
- **Green only if ALL pass AND program hash matches the ENSIP-25 record.**
- Pulls **4 numbers** from the `quote()` simulation battery:
  1. **monotonicity** — 0 violations
  2. **exactIn/exactOut symmetry** — max bps drift
  3. **oracle-guard trigger count**
  4. **skew penalty ≤ cap**
- **Latency fallback:** first paint renders a **canned card** (SSR) before the live compile returns; 1500ms watchdog swaps a stalled live stream to `replay.json`.

### Pane: 5TH — `EnsDiscovery` (the ENS-prize evidence pane)
- Resolves the strategy **subname** live (e.g. `eth-usdc-guarded.strategist.eth`).
- Shows **`programHash`** (from the ENS `v0.programhash` text record) **vs the on-screen bytecode**, **side-by-side**.
- **Mismatch → turns red** (the ENS hash-verify negative path, shown live). *"The taker found this strategy through ENS, not our database — and checked it wasn't tampered with."* This is what makes ENS load-bearing, not cosmetic.

---

## §4 — The demo flow (`/demo`) — 3 beats + live revert

A **deterministic 240-second stage controller** (`demo/controller.ts`) drives the real pipeline against a **fresh fork cut at T-15min**. Every beat has a canned replay twin; the ONE un-cannable call is the **live `swap()`** (satisfies 1inch's on-chain-transfer bar).

| Window | Beat | What the UI shows | Canned twin |
|---|---|---|---|
| **0–60s** | **A — ship** | Sentence → bytecode (split-screen) → green safety card → **live `ship()`** (the one live on-chain token flow). | all but `ship()` |
| **60–150s** | **B — ENS-discover + judge-triggered revert** | `EnsDiscovery` resolves subname, verifies hash. Judge picks a deviated state → `MockAggregatorV3` pushes it → **`_oracleGuard2D` HALTS quoting on screen** (red). *"The protection lives in the VM — nothing the AI did could disable it."* | ENS resolution; NOT the halt |
| **150–220s** | **C — autonomous retune** | A real subgraph entity delta crosses threshold → agent notices → `dock()` + recompile + `ship()` in seconds, **autonomously, no click**. *"Your LP position just adapted itself."* | full beat (drops to narrated screenshot if timing slips) |
| **220–240s** | **compliance card** | "Powered by SwapVM — © Degensoft Ltd 2025" + recap. | — |

**Stage discipline:** three beats, each with a canned replay twin (`DEMO_LIVE=0`). The two un-cannable moments are the **live `swap()`** and the **judge-triggered halt** — those are the rubric-killers. **Cut plan if timing slips:** drop Beat C to a narrated screenshot first; **never** cut the live `swap()`, the reject-and-rewrite WOW beat, or the ENS discovery panel (those clear 1inch, WOW, and ENS respectively).

> **Safety narrative:** build the protection story on the **oracle clamp** (`_oracleGuard2D`, which fires routinely in live pools) rather than a heal-side discount — the heal-side reward is ~0 in the tested regime. See [PITCH.md](./PITCH.md).

---

## §5 — Data flow (the one diagram that matters)

```
 Browser (/, /demo)  ──SSE──►  Next.js server  ──in-process──►  compiler (emit + reject)
      ▲                            │                                resolveVerify (ENS)
      │                            │                                graphDelta (subgraph)
      │                            └─►  /api/compile (POST)          └─► anvil fork (live swap())
      └──────── single event stream ◄── agent emits: verdict, bytecode tokens,
                                        safety numbers, ENS res, retune events
```

- **No client → GraphQL path.** The UI consumes the agent's SSE stream only.
- **No second service.** Agent = server libraries, not a separate process.
- **Fallbacks:** `DEMO_LIVE=0` → canned `replay.json`; 1500ms watchdog → cached-but-real response (disclosed).

---

## §6 — Suggested color system

A dark, terminal/IDE-adjacent palette — the product reads as a *compiler for traders*, so it should feel like a code tool with live-market accents. WCAG-AA contrast against the dark backgrounds.

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0B0E14` | App background (near-black, faint blue) |
| `bg-surface` | `#121622` | Pane / card backgrounds |
| `bg-surface-2` | `#1A2030` | Raised surfaces, the bytecode pane |
| `border` | `#262D3D` | Pane borders, dividers |
| `text-primary` | `#E6EAF2` | Primary text |
| `text-muted` | `#8A93A6` | Labels, secondary text, token lengths |
| `accent-brand` | `#5B8DEF` | Brand/links, the live `ship()` action, AST move-arrows |
| `ok` (green card) | `#3DD68C` | Safety card green, hash-match, monotonicity pass |
| `danger` (red card) | `#FF5C5C` | REJECTED card, hash mismatch, halt, oracle-guard trigger |
| `warn` | `#FFB454` | Cached/fallback badge ("disclosed cached"), stale-state hints |
| `opcode-skew` | `#C792EA` | `_inventorySkew2D` token accent |
| `opcode-guard` | `#F78C6C` | `_oracleGuard2D` token accent |

**Conventions:**
- **Safety card** = solid `ok` or `danger` background with the verdict word large (`SAFE` / `REJECTED`); the 4 numbers in a row beneath.
- **Bytecode tokens** = monospaced (`ui-monospace`); opcode byte tinted by its accent (`opcode-skew`/`opcode-guard` for our two custom opcodes, `text-muted` for the rest), `[len]` in `text-muted`, args in `text-primary`.
- **Reject-and-rewrite diff** = standard unified-diff coloring: removed lines `danger`-tinted bg (`rgba(255,92,92,.12)`), added lines `ok`-tinted bg (`rgba(61,214,140,.12)`); the AST move-arrow in `accent-brand`.
- **`EnsDiscovery`** = two hash columns; on match both render `ok`, on mismatch both flip `danger` with a "TAMPERED" tag.
- **Fallback badge** = small `warn`-colored chip ("cached" / "subgraph syncing") so canned paths are always disclosed — honesty is a judging criterion.

> Keep it to **one typeface stack**: `ui-sans-serif` for chrome/labels, `ui-monospace` for bytecode, hashes, and any numeric/protocol value. No more than two weights per family.

---

## §7 — Failure tree (rehearse, print for stage)

| Failure | UI response | Line |
|---|---|---|
| **LLM/`/compile` flakes (Beat A)** | Watchdog swaps to cached-but-real card (pre-warmed, disclosed); P2 retries silently. | "cached response — the live model is warming." |
| **x402 hiccups (Beat C)** | Env-var swap to Studio key (rehearsed). | "the agent normally pays per query — falling back to our key." |
| **Fork RPC dies (Beat B)** | Backup anvil on laptop B; P1 swaps RPC ≤15s while P3 narrates the ENS records already on screen; if >20s, `DEMO_LIVE=0` → canned, *except* retry live `swap()` once. | narrate; never dead-air. |
| **Oracle staleness fires spuriously** | That IS the circuit breaker working — narrate honestly, re-cut to the mock-oracle path. | "that's the halt doing its job." |
| **Total demo loss** | Pre-recorded fallback video (recorded at G3), narrated live. Never debug on stage past 20 seconds. | — |

---

## §8 — Build windows (P3's UI slice, from the Gantt)

| Window | UI task |
|---|---|
| **h0–2** 🔴 | `demo/{timeline.ts, controller.ts}` — the deterministic 240s controller with `DEMO_LIVE=0` canned-twin switching. |
| **h8–10** | UI scaffold: Next.js App Router, SSR, 3 panes on fixture (left/right/bottom). Fixtures conform to Flavio's frozen `specVersion: 1`. |
| **h10–12** | `parseProgram` + `safetyReport`: card pulls the 4 numbers; verdict green only if all pass + hash matches; first paint canned (SSR); 1500ms watchdog. |
| **h12 = G1** 🟢 | Walking skeleton on fixture. |
| **h14–16** | Beat B/C plumbing: `liveSwap` + mock-oracle wiring; consume Flavio's disassembler decoder for the bytecode pane (real tokens). |
| **h16–20** | SSE bridge → real `/compile` (the UI's only data path). Start `make demo-up` skeleton. |
| **h20–22** | `graphDelta` + `EnsDiscovery` pane (resolves subname live, hash side-by-side, mismatch→red). |
| **h22–24 = G2** 🟢 | Autonomous retune wired to Beat C; retune evidence log rendered in UI (query, entity ID, delta, decision, tx hash). |
| **h28–30 → G3** 🟢 | `make demo-up` green ×2; full 240s dry-run recorded (= fallback video base); canned twins for every beat. Freeze h30. |
| **h34–35** | Demo run: full rehearsal against fresh fork; print the failure tree. |

**P3's personal cut order:** x402 first → `EnsDiscovery` polish second → **never** the retune or the safety card.
