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
  there. [Finding the action-creation UI under a different section — updating
  this entry with exactly where once confirmed.] First-run navigation cost us
  a real back-and-forth.
- **2026-09-09 — signing key shown exactly once** at "configure World ID".
  The one-shot rule is documented, but there is no "download .env snippet"
  option; you get one render of the private key in the browser. Rotate exists
  (and correctly warns it disables the old signer). Fine for us, but a
  first-timer who misses the copy loses the key on day one.
- **2026-09-09 — "World ID Sandbox → Install the test build" is right in the
  sidebar**, which is good discoverability once you know it exists.

## 3. Sandbox App states, proof flows, test users, errors, and edge cases

- Access requested **2026-09-09** (form) — this section fills as soon as we
  get in. Planned coverage per the docs: Hot / Cold / Semi-cold states,
  cross-device QR with proof returning to the web session, test-user creation,
  invite-code handling, and the documented iOS semi-cold limitation.

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
- (running list — appended as we go.)

---

*How to reproduce our setup:* see `docs/strategy/ETHONLINE-2026-CONTINUITY.md`
(Fase 1) and the local-stack instructions in issue #61 §5.
