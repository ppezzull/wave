# LEDGER-FEEDBACK.md — Ledger Agent Stack × wave (ETHOnline 2026, Continuity)

DX feedback document for the **Ledger Continuity** track ("judged as much as
the code", per the track page). Living log — entries are added while we build.
Dates are 2026-09-xx; **Ledger submissions close Sep 13** (two days).

**Project context.** wave is a social market for natural-language on-chain
strategies on 1inch SwapVM (ETHGlobal Lisboa 2026, now in the Continuity
track). An autonomous agent retunes live strategies; the riskiest actions are
gated behind a human-approval queue (HITL). Ledger enters in two places:
(a) **device confirmation** — approving a high-risk action will require a
signature made ON the hardware (the approval currently is a bare button
click), and (b) **Key Ring** — the agent wallets' keys move out of `.env`
into `wallet-cli ring`, encrypted under the Ledger seed.

---

## 1. Overall SDK / docs experience

- **2026-09-11 — the agent-skills distribution is excellent.**
  `npx skills add ledgerhq/agent-skills` drops four well-scoped SKILL.md files
  (DMK implementation, wallet-cli usage, business logic, intent vocabulary)
  with a clear process (sequential gates → PROCEED/WAIT/ABORT/ESCALATE),
  explicit security rules ("no stub in production", "never reuse a
  signature", "the device screen is the only trusted display") and error
  classification tables. This is the best agent-facing hardware docs we have
  used — more of this everywhere.
- (to expand: DMK init / discovery / signing once the device is in hand.)

## 2. Gaps and specific improvements

- **2026-09-11 — the track's own deadline differs from the event's.** The
  ETHOnline Ledger page says submissions close **Sep 13**, while ETHGlobal's
  event runs to Sep 16. We almost missed it reading only the event page —
  worth a banner in the event's prize list for track-specific deadlines.
- **2026-09-11 — device availability is a hard external dependency.** For a
  remote team, "the device is at a teammate's place" is a real schedule risk;
  nothing in the track (simulator/sandbox equivalent, remote device service)
  mitigates it. A documented "development without the device" path (like
  World's Simulator) would remove a whole class of last-minute scrambles.
- (running list.)

## 3. Time-saver suggestions & tutorial ideas

- The intent map in `wallet-cli-usage` (informal phrasing → command) is a
  pattern other CLIs should copy.
- TODO after integration: concrete before/after DX notes.

---

*Setup:* `npm i -g @ledgerhq/wallet-cli` · skills in `.agents/skills/` ·
integration plan in `docs/strategy/ETHONLINE-2026-CONTINUITY.md`.
