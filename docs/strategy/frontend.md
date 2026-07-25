# frontend.md — the UI spec (the questionnaire init flow)

_The UI spec — **rewritten in scope**: the frontend's first job is the **init flow**, a SiteLab-style multi-step questionnaire that turns a strategist's intent into a shipped strategy project. This doc mirrors the intake model of [`apps/questionnaire`](file:///Users/ppezz/Desktop/MOODGLOBAL/SiteLab/apps/questionnaire) (9-step intake → brief → auto-init → project card). **Owner: P3 (Pietro)**. Companion docs: [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md) §1.5 (opcode/compiler spec), [PROOF-OF-CAPITAL.md](./PROOF-OF-CAPITAL.md) (the verbs), [AGENT.md](./AGENT.md) (the generate step runs there)._

> **Hard rule (carries finalist weight):** the UI owns **no business logic on the client**. The questionnaire collects inputs and POSTs them to the server; the **brief aggregation, the compile/generate, the ENS writes, the `ship()` all run in the agent container** ([AGENT.md](./AGENT.md)) reached over `AGENT_URL=http://agent:3002` (HTTP/SSE). The browser is intake + status only — it never calls the LLM, never holds API keys, never signs, never queries GraphQL directly.

> **What this doc is NOT anymore.** The earlier scope (global ranked feed on `/`, split-screen compose panes, safety card, `EnsDiscovery` pane) is **out of scope for this doc**. Those surfaces still ship — they move to follow-up docs once the init flow is the source of truth here. This file now answers one question: **how does a strategist go from a blank screen to a registered, shipping strategy project?**

---

## §1 — The flow, end to end (SiteLab model, wave domain)

SiteLab's questionnaire app does: **landing → 9-step intake → "Complete Setup" → fire-and-forget `runBuild()` → redirect to dashboard → project card with waiting animation → auto-refresh on completion.** Wave copies that shape exactly, substituting website-generation for strategy-compilation:

```
 Landing (/)  ──►  9-Step Questionnaire (/new)  ──►  Complete Setup
                                                          │
                                                          ▼  fire-and-forget
                                                  runBuild()  ──►  AGENT (AGENT_URL)
                                                          │            │ compile (reject+rewrite)
                                                          │            │ resolveVerify (ENS)
                                                          │            │ register subname + setText
                                                          │            │ ship() on Sepolia
                                                          ▼
                                            redirect → /dashboard
                                                          │
                                            project card: building…  ──auto-refresh──►  live
```

- **Intake is client-side state** — persisted to `localStorage` across the 9 steps (draft only; nothing is written to chain until "Complete Setup"). There is **no database** ([PROOF-OF-CAPITAL.md](./PROOF-OF-CAPITAL.md): "there is no off-chain store"). The draft lives in the browser; the project lives on chain + ENS.
- **`runBuild()` is fire-and-forget** — the server action kicks the agent and returns immediately; the user never waits on the LLM/compile/ship in the request. Same pattern as SiteLab's `triggerInitForProject`.
- **The dashboard project card is the status surface** — `building → indexing → live`, auto-refreshing (SiteLab: `project-waiting-animation.gif` → auto-refresh). For wave, "live" = the strategy is registered on ENS + `ship()` confirmed on Sepolia + the subgraph has indexed the deploy.
- **Double-click protection** — local `isSubmitting` guard + spinner + disabled "Complete Setup", identical to SiteLab. A second `ship()` is the kind of thing that costs real gas; prevent it.

---

## §2 — The 9 steps (each step's items)

Mirrors SiteLab's 9-step structure (`step-one` … `step-nine`) 1:1. Each row below is the **field list for that step** — what the component renders, what it collects, and the wave-domain meaning. The Zod schema in §3 is the source of truth for the field names.

| Step | SiteLab analog | Wave component | Purpose | Items collected |
|---|---|---|---|---|
| **1** | Template selection (preview) | `step-template.tsx` | **Strategy template** with live preview | `template_id` — pick a starting strategy archetype (e.g. *guarded-eth-usdc*, *skew-rebalancer*, *decay-mean-reversion*). Each template is a pre-filled draft that loads canonical opcode defaults into the later steps. Preview = a rendered bytecode + safety-card mock of the template (read-only). |
| **2** | Business category | `step-pair.tsx` | **Market / pair** | `pair` — the trading pair (e.g. `ETH/USDC`, `WBTC/ETH`). Drives oracle selection in step 6. |
| **3** | Website type (landing/multi) | `step-direction.tsx` | **Direction / side** | `direction` — `exactIn` or `exactOut` (the SwapVM `SwapQuery.isExactIn` axis). Determines rounding semantics (see CLAUDE.md math conventions). |
| **4** | Business description | `step-description.tsx` | **The strategy description — the prompt** | `description` — free-text NL. **This is load-bearing ([Pietro.md](../tasks/Pietro.md) "the post is the prompt"):** the description is BOTH the human-readable strategy text AND the literal compiler input, stored byte-for-byte as the ENS `description` record. No separate label. Must round-trip byte-for-byte into `/compile`. |
| **5** | Goals multi-select | `step-objectives.tsx` | **Objectives** (multi-select) | `objectives[]` — the strategy's goals, drawn from the canonical opcode menu: `concentrate`, `decay`, `oracleGuard`, `inventorySkew`, `makerFee`, `protocolFee`, `curve`. Each toggled objective enables its opcode block in step 7. |
| **6** | Brand assets (logo, colors, fonts) | `step-risk.tsx` | **Risk parameters** (the "brand" of the strategy) | `oracle_band` — the `_oracleGuard2D` deviation cap (bps) + `maxStalenessSecs`; `deadline` — order TTL; `salt` — (auto-derived, shown read-only). These are the "look and feel" of *this* strategy the way colors/fonts are for a site. |
| **7** | Reference screenshots | `step-references.tsx` | **Reference strategies** (fork seeds) | `references[]` — ENS names or subgraph strategy IDs the strategist wants to fork from. Loads those strategies' ENS-published `description` records as additional seed context for the compiler. **Fork is the thesis verb** ([PROOF-OF-CAPITAL.md](./PROOF-OF-CAPITAL.md)); this step promotes it. |
| **8** | Domain ownership status | `step-ens.tsx` | **ENS identity** | `ens_name` — the parent ENS name to register the strategy subname under (e.g. `pietro.eth`); `subname` — optional explicit subname, else derived from the pair+template (e.g. `eth-usdc-guarded`). This is where identity is bound — the social handle ([PROOF-OF-CAPITAL.md](./PROOF-OF-CAPITAL.md): "profiles are ENS"). |
| **9** | Final details + Complete Setup | `step-review.tsx` | **Review + commit** | `capital` — committed capital amount + token; `deadline` confirm; `notes` (optional, local-only — not written on chain); then **Complete Setup** fires `runBuild()`. |

**State persistence (SiteLab-parity):** draft lives in `localStorage` under three keys (mirroring SiteLab's `draft / assets / references`): `wave.draft` (steps 1–6, 8–9 scalar fields), `wave.references` (step 7 fork seeds), `wave.risk` (step 6 risk params). Cleared on successful `runBuild()` return.

---

## §3 — The Zod schema (`packages/schema` → `waveInitSchema`)

Source of truth for the field names above. Modeled on SiteLab's `QuestionnaireSchema` (`packages/schema/src/zod/config/questionnaire.ts`): nullable fields (the user can skip non-critical steps), `nullish` throughout so a partial draft persists in `localStorage` across refreshes.

```ts
// packages/schema/src/zod/input/wave-init.ts
import { z } from 'zod';

/** Canonical opcode objectives (step 5) — drawn from §1.5 block menu. */
const Objective = z.enum([
  'concentrate', 'decay', 'oracleGuard', 'inventorySkew',
  'makerFee', 'protocolFee', 'curve',
]);

export const waveInitSchema = z.object({
  // Step 1 — strategy template (uuid of a seeded archetype, or null for blank)
  template_id: z.string().uuid().nullish(),

  // Step 2 — trading pair (e.g. "ETH/USDC")
  pair: z.string().min(2).nullish(),

  // Step 3 — swap direction
  direction: z.enum(['exactIn', 'exactOut']).nullish(),

  // Step 4 — THE PROMPT. Free-text, byte-for-byte into /compile + ENS description.
  // No trim, no reflow, no normalization — a mismatch is a compile failure.
  description: z.string().nullish(),

  // Step 5 — objectives (multi-select from canonical opcodes)
  objectives: z.array(Objective).nullish(),

  // Step 6 — risk parameters ("brand")
  oracle_band: z.object({
    maxDeviationBps: z.number().int().positive(),
    maxStalenessSecs: z.number().int().positive(),
  }).nullish(),
  deadline: z.number().int().positive().nullish(),   // order TTL (seconds)
  // salt is auto-derived server-side; not collected.

  // Step 7 — references (ENS names / strategy IDs to fork from)
  references: z.array(z.string()).nullish(),

  // Step 8 — ENS identity
  ens_name: z.string().nullish(),       // parent name, e.g. "pietro.eth"
  subname: z.string().nullish(),        // optional explicit, else derived

  // Step 9 — commit + notes
  capital: z.object({
    amount: z.string(),                  // human-readable, parsed server-side
    token: z.string(),
  }).nullish(),
  notes: z.string().nullish(),          // local-only, NOT written on chain
});

export type WaveInitData = z.infer<typeof waveInitSchema>;
```

> **Validation posture:** like SiteLab, the schema validates the **intake shape** only. Whether the assembled brief *compiles* is the agent's job (`runBuild()` → compile → `Rejection`/verdict) — that is not a Zod concern and must not be pre-flight-checked client-side (no business logic on the client).

---

## §4 — Brief aggregation (intake → the one string the agent compiles)

SiteLab aggregates the questionnaire answers into a single `aggregatedBrief` string before `triggerInitForProject`. Wave does the same — the 9 steps' structured fields collapse into **one NL brief** that is the compiler input (and, byte-for-byte, the ENS `description`). Server-side only.

```
runBuild(draft: WaveInitData)
  └─► aggregateBrief(draft)        // pure fn, server action
        │  "Guarded ETH/USDC exactIn strategy: concentrate around mid with
        │   24h decay, oracle band 200bps/1200s, inventory skew rebalance.
        │   Forking context from eth-usdc-guarded.wave.eth. Commit 5000 USDC.
        │   Register under pietro.eth."
        └─► POST AGENT_URL/compile  { brief, description: draft.description }
              │   (agent: compile → reject+rewrite → resolveVerify → register → ship)
              └─► projectId (= strategy ENS node) → dashboard card
```

- **`aggregateBrief` is pure and server-side** — testable without the LLM. It reads the structured fields and emits one NL string. The `description` field (step 4) is passed through **verbatim**, not reflowed — the post-is-the-prompt constraint.
- **The agent owns everything past `aggregateBrief`** — compile verdict, ENS register/setText, `ship()`. The UI never sees a private key.

---

## §5 — Auto-init build flow (the dashboard card)

Direct port of SiteLab's auto-init (`CompletionPopup → runBuild() → /dashboard → waiting animation → auto-refresh`):

| Stage | UI state | Source of truth |
|---|---|---|
| **Click Complete Setup** | spinner, `isSubmitting` guard, redirect to `/dashboard` | local |
| **Building** | project card, `building` state, waiting animation | agent compile/resolve/register in progress |
| **Shipping** | card flips to `shipping` | `ship()` tx broadcast on Sepolia |
| **Indexing** | card shows `indexing` `warn` chip ("subgraph syncing") | subgraph lag — disclosed, never faked |
| **Live** | card flips to `live`, safety verdict + `returnPct` placeholder | ENS record confirmed + subgraph indexed the deploy |

- **Auto-refresh** polls `getBuildStatus(projectId)` (server action → agent) on an interval; flips `building → live` without a manual reload.
- **No canned fallback in the card.** If the build fails, the card shows `failed` with the agent's `Rejection` reason (the same red-card verdict the compile step produces). Honest failure — the failure tree (subgraph lag, RPC dies, tx revert) lives with the deferred demo doc (§9), but the card itself never lies.

---

## §6 — Stack & technicalities (built the SiteLab way)

The Next.js app is bootstrapped exactly like SiteLab's questionnaire app — pnpm monorepo, App Router, SSR, Tailwind v4.

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **pnpm workspaces** (`apps/*`, `packages/*`) — root `package.json` + `pnpm-workspace.yaml`, matching SiteLab | Shared `packages/schema` (the Zod schemas) + `packages/agent-client` (the `AGENT_URL` RPC wrapper) live alongside the app |
| Framework | **Next.js (App Router, SSR)**, React 19 | SSR keeps `runBuild()` server-side; Server Components render the dashboard card from agent status |
| Styling | **Tailwind v4** (`@import "tailwindcss"` + `@theme` tokens in `app/globals.css`) | SiteLab parity; tokens map to the color system in §7 |
| Validation | **Zod** (`waveInitSchema`, §3) in `packages/schema` | SiteLab parity; intake shape validation |
| Network | **Sepolia** (live) | every shipped strategy is a real on-chain action |
| Agent transport | server actions → `AGENT_URL=http://agent:3002` (HTTP/SSE) | agent is a separate container ([AGENT.md](./AGENT.md)); UI holds no keys |
| Attributions | **"Powered by SwapVM — © Degensoft Ltd 2025"** in the footer from hour 1 | 1inch license compliance (Classic track) |

**Files (real repo paths):** `srcs/requirements/ui/app/(app)/new/page.tsx` (the 9-step flow), `srcs/requirements/ui/app/(app)/dashboard/page.tsx` (project cards), `srcs/requirements/ui/actions/build.ts` (`runBuild`, `getBuildStatus`), `packages/schema/src/zod/input/wave-init.ts` (§3). The agent lives in `srcs/requirements/agent/`; the UI calls it over `AGENT_URL`, never imports it.

**Scope-cut floor:** the 9-step intake + `runBuild()` → a project card that flips to `live`. **Never cut:** step 4 (the description/prompt), step 8 (ENS identity), the "no business logic on the client" rule, the attribution footer.

---

## §7 — Color system (kept from the prior scope — still the design language)

A dark, Atlantic-adjacent palette tuned to the colors of **Carcavelos beach** (Lisboa). Ship as **Tailwind v4 `@theme` tokens** in `app/globals.css` (CSS custom properties consumed via `var(--*)`); no JS theme object — keeps "no business logic on the client" clean.

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#01293A` | App background (deep Atlantic) |
| `bg-surface` | `#024055` | Card / pane backgrounds |
| `bg-surface-2` | `#006994` | Raised surfaces, the bytecode pane |
| `border` | `#0A6E8C` | Pane borders, dividers |
| `text-primary` | `#EAF6FB` | Primary text |
| `text-muted` | `#8FD2E6` | Labels, secondary text |
| `accent-brand` | `#48D1CC` | Brand/links, the `ship()` action |
| `ok` | `#7FE3B0` | Safety green, hash-match |
| `danger` | `#FF6B6B` | REJECTED card, hash mismatch, halt |
| `warn` | `#FFD66B` | "indexing" / stale-state chip |

**Sea gradient** — use on hero/backdrop surfaces and the `ship()` CTA hover:

```css
/* app/globals.css — Tailwind v4 @theme */
@import 'tailwindcss';

@theme {
  --color-bg-base: #01293A;
  --color-bg-surface: #024055;
  --color-bg-surface-2: #006994;
  --color-border: #0A6E8C;
  --color-text-primary: #EAF6FB;
  --color-text-muted: #8FD2E6;
  --color-accent-brand: #48D1CC;
  --color-ok: #7FE3B0;
  --color-danger: #FF6B6B;
  --color-warn: #FFD66B;
}

/* the water column: seabed → surf line */
--sea-gradient: linear-gradient(180deg, #01293A 0%, #024055 28%, #006994 58%, #0A6E8C 78%, #48D1CC 93%, #AFEEEE 100%);
```

**Conventions:** safety verdict word large (`SAFE` / `REJECTED`); bytecode/numeric values in `ui-monospace`; the `building → indexing → live` card states use `warn` → `ok` respectively. One typeface stack: `ui-sans-serif` for chrome, `ui-monospace` for protocol values.

---

## §8 — Build windows (P3's UI slice)

| Window | UI task |
|---|---|
| **h0–2** 🔴 | pnpm monorepo boot: root `package.json` + `pnpm-workspace.yaml` (`apps/*`, `packages/*`); `packages/schema` with `waveInitSchema` (§3); Next.js app in `apps/ui` (App Router, Tailwind v4, §7 tokens). Attribution footer. |
| **h8–10** | The 9-step intake (`/new`): step components per §2, `localStorage` persistence across the three draft keys, progress + back/next. |
| **h10–12** | `aggregateBrief()` (pure, server) + `runBuild()` / `getBuildStatus()` server actions → `AGENT_URL` RPC stub (agent returns canned `building → live` until compile lands). |
| **h12 = G1** 🟢 | Walking skeleton: fill 9 steps → Complete Setup → dashboard card flips `building → live` against a stubbed agent. **Merge to `main`.** |
| **h14–20** | Wire `runBuild()` to the real agent compile + ENS register + `ship()` (as Flavio/Flaviano land their halves). Card states reflect real on-chain truth. |
| **h22–24 = G2** 🟢 | End-to-end: 9-step intake → real compile → real ENS register → real `ship()` on Sepolia → card flips live when subgraph indexes. **Merge to `main`.** |

**P3's personal cut order:** stub-agent path first (so the intake is demoable at G1 without the spine) → step 8 ENS polish → **never** step 4 (the prompt), the attribution footer, or the no-client-logic rule.

---

## §9 — Out of scope for THIS doc (tracked, not specified here)

Surfaces the old `frontend.md` owned, now deferred to follow-up docs once the init flow is locked:

- The **global ranked feed** on `/` (`getFeed()` = subgraph + ENS, ranked by `returnPct × recencyDecay × (1 + log2(1 + followers))`).
- The **split-screen compose** (intent / bytecode / safety-card panes), the `EnsDiscovery` hash-verify pane, the reject-and-rewrite diff.
- The `/[handle]` **profile** page (follows / followed-by from ENS).
- The **demo beats** (A feed / B compose+ship / C ENS-discover+halt / D autonomous retune) and the **failure tree**.

These remain P3-owned and on the build plan; they're just not in *this* file anymore. When the init flow merges, split these into `feed.md` / `compose.md` / `profile.md` / `demo.md` (one job each — caveman-style docs).
