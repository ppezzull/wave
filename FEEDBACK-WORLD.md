# FEEDBACK-WORLD.md — AgentKit × wave (ETHOnline 2026, Continuity)

Feedback document required by the **AgentKit Continuity** track. It follows the
four areas the bounty asks for, in the same order. This is a **living log**:
entries are added while we build, not retro-fitted at submission time. Dates
are 2026-09-xx during the event (Sep 4–16).

**Project context.** wave is a social market for natural-language on-chain
strategies on 1inch SwapVM (first built at ETHGlobal Lisboa 2026). We are
adding World as the trust layer: World ID (verified human) for publishing,
AgentKit/AgentBook for human-backed agents calling our MCP surface, and —
pending feature-flag access — Selfie Check as a live-presence signal on the
human-approval gates for high-risk autonomous actions.

---

## 1. AgentKit docs and integration flow

- **2026-09-09 — package layout is clean but split across repos/pages.** The
  integrate guide (docs.world.org/agents/agent-kit/integrate) shows `npm i
  @worldcoin/agentkit` and a Hono example, but `@worldcoin/agentkit` (v0.2.1)
  only pulls in `@worldcoin/agentkit-core` + `@x402/core`. The Hono middleware
  (`@x402/hono`) shown in the example is **not** a dependency and must be
  installed separately — we only noticed by reading `node_modules`. A one-line
  "install this too" in the guide would save the first 20 minutes.
- **2026-09-09 — the typed API is readable and honest.** Reading
  `dist/index.d.ts` answered most integration questions directly:
  `createAgentkitHooks({ agentBook, mode, storage, rpcUrls, onEvent })` →
  `{ requestHook, verifyFailureHook }`; `AgentKitStorage` documents the
  atomicity requirement (`tryIncrementUsage` MUST be a single atomic
  check-and-increment to prevent TOCTOU) — good to see stated in the interface
  docs, not just prose.
- **2026-09-09 — no Developer Portal anywhere in the AgentKit flow.** The
  integrate page mentions no app_id/API keys for AgentKit itself (only the CLI
  + World App verify). True and convenient, but it also means the Portal and
  AgentKit feel like two disjoint worlds at first — see §2.
- (to expand: CLI `register`/`status` flow once sandbox access lands, §3.)

## 2. Developer Portal navigation, search, product discovery, and debugging

- **2026-09-09 — action creation is not where you'd look first.** "World ID
  Configuration" holds app_id / rp_id / signer / rotate — we expected actions
  there. Confirmed 2026-09-10: actions live under the **Verification** section
  of the sidebar, a separate home from the keys they bind to. First-run
  navigation cost us a real back-and-forth.
- **2026-09-09 — signing key shown exactly once** at "configure World ID".
  The one-shot rule is documented, but there is no "download .env snippet"
  option; you get one render of the private key in the browser. Rotate exists
  (and correctly warns it disables the old signer). Fine for us, but a
  first-timer who misses the copy loses the key on day one.
- **2026-09-09 — "World ID Sandbox → Install the test build" is right in the
  sidebar**, which is good discoverability once you know it exists.
- **2026-09-10 — the Changelog field silently rejects non-ASCII.** Submitting
  for review failed on em dashes ("—") and ">" with only "can only contain
  letters, numbers and certain special characters" — the allowed set is never
  listed. Plain ASCII passed.
- **2026-09-10 — App type decides whether the whole Store listing matters.**
  Choosing "External integration" (our case: World ID added to an existing web
  app) makes category/countries/localisations/showcase moot, but the form
  surfaces them identically either way — we filled the entire store listing
  before learning it was irrelevant. A hint at the top of the listing form
  would save an hour.

## 3. Sandbox App states, proof flows, test users, errors, and edge cases

- Access requested **2026-09-09** (form) — **arrived 2026-09-11** as a Firebase
  App Distribution invitation for the Android sandbox build
  (`org.world.id.sandbox`, developer contact murph.finnicum@toolsforhumanity.com,
  valid 30 days). Our only phone is an iPhone: the Android invite can't install
  there, and the iOS sandbox is a separate **TestFlight** invite the docs
  mention only in passing — we had to discover the platform split by receiving
  the wrong-platform invite first. (Ask your World contact for the TestFlight
  link if you are iPhone-first.)
- Coverage as we get in: Hot / Cold / Semi-cold states, cross-device QR with
  proof returning to the web session, test-user creation, invite-code handling,
  the documented iOS semi-cold limitation.

## 4. What was confusing, missing, broken, or hard to test

- **2026-09-09 — `@x402/hono` not auto-installed** (see §1): example code in
  the guide does not run with just the documented install line.
- **2026-09-09 — credential-preset terminology shifts between pages.** The
  IDKit credentials page names presets (`proofOfHuman`, `selfieCheckLegacy`),
  the Selfie Check page calls it "credential ID 11", and the portal UI may use
  different labels again. We mapped them by hand.
- **2026-09-09 — Selfie Check is World ID 3.0-only right now** ("World ID 4.0
  support is not yet available" on the presets page) while World ID 4.0 is the
  headline migration path elsewhere. Not wrong — just a version matrix the
  integrator has to reconstruct.
- **2026-09-09 — the client only signs after a 402.** Reading the SDK: the
  client's fetch wrapper signs and retries ONLY when the server first answers
  `402` with the x402 challenge declaring the AgentKit extension; any other
  status (our plain 403) is passed through unsigned. The integrate page
  presents client and server halves independently and never states this
  ordering — we wired the server first and expected the client to attach the
  header unconditionally. (Our e2e smoke builds the header manually via the
  exported `formatSIWEMessage`; official-client interop needs the 402
  advertisement, which is also where the x402 payment fallback naturally
  lives.)
- **2026-09-09 — SIWE constraints are enforced deep in the stack.** The
  payload schema accepts any `nonce` string, but `formatSIWEMessage` (viem
  SIWE under the hood) requires **alphanumeric, ≥8 chars** — a `crypto.randomUUID()`
  (with dashes) throws at signing time. Same class of trap: `domain` must be
  the **bare hostname** (`validateAgentkitMessage` compares against
  `new URL(expected).hostname`), not the origin. Both are one-line fixes once
  known; neither is stated on the integrate page.
- **2026-09-10 — IDKit 4.x: `rp_context` is mandatory and server-signed.**
  The widget requires `rp_context` (`{rp_id, nonce, created_at, expires_at,
  signature}`) produced by `signRequest()` from `@worldcoin/idkit/signing`
  with the Developer Portal signing key — the client cannot open a valid
  request without a server round-trip first. v3-era snippets (app_id + action
  only) still float around the docs and do not type-check against the 4.x
  widget.
- **2026-09-10 — verification is backend-only, and the anti-replay is DIY.**
  You forward the IDKit result as-is to `POST /api/v4/verify/{rp_id}`; the
  portal validates the ZK proof, the rp_context signature, and burns the
  nullifier globally. But one-proof-one-action enforcement server-side is left
  entirely to the integrator: we keep a nullifier→signal ledger and delete the
  record when the gated action ships. No storage helper ships with the SDK.
- **2026-09-10 — signal binding is also DIY.** The docs say "your backend
  should enforce the same value" for the signal; the only tooling is
  `hashSignal()` from `@worldcoin/idkit/hashing`, which you compare against
  `responses[0].signal_hash` yourself. There is no verify-with-expected-signal
  convenience endpoint or helper.
- **2026-09-10 — `environment` accepts "sandbox" only in the types.** The
  widget config union is `'production' | 'staging' | 'sandbox'`, but the docs
  pages describe just staging/production; sandbox appears solely in the TS
  definitions. We default to staging and flip at submission time.
- **2026-09-11 — AgentBook human-backing hard-requires Orb.** The register
  verification request (`world.org/verify?t=wld&…`) is refused by the World App
  with "AgentKit requires the user to be Orb-verified" even for a
  **passport-verified** account — the passport credential does not satisfy it,
  and there is no fallback. For a fully-online hackathon with no Orb access in
  our region this makes real registration geographically gated. (Registration
  attempt itself worked fine up to that point: nonce lookup + verification
  request + deep link all correct.)
- **2026-09-11 — the verify deep-link is a silent no-op for unverified
  accounts.** With a fresh, unverified World App the same link opens the app
  and does… nothing: no confirm flow, no error, no onboarding hint. We only
  understood why after checking verification status manually.
- **2026-09-11 — the SDK's own extension builder produces extensions its own
  client rejects.** The official client's `isAgentkitExtension()` requires
  `info.nonce` + `info.issuedAt` (server-issued freshness / anti-replay), but
  the SDK's documented `declareAgentkitExtension()` never sets them — so a 402
  built solely from the helper is **silently ignored** by the official client:
  no event, no error, the caller just sees the 402 again. We enrich the
  declaration with a fresh server nonce + timestamp before serving it. The
  design intent is actually good once you see it (the server nonce flows into
  the signed message, so the relying party's nonce ledger covers it) — but
  nothing documents it, and the helper/client mismatch makes first
  interop a coin flip.
- (running list — appended as we go.)

---

*How to reproduce our setup:* see `docs/strategy/ETHONLINE-2026-CONTINUITY.md`
(Fase 1) and the local-stack instructions in issue #61 §5.
