# Wave — Strategy Compiler for 1inch SwapVM

> **1inch built a virtual machine for market-making strategies — but no compiler. We built the compiler.**
>
> Describe your strategy in one sentence; get a custom, simulated, verified market-making position live on-chain — and one that retunes itself.

**ETHGlobal Lisboa 2026** · Classic "from scratch" track · build Fri Jul 24 → submission Sun Jul 26, 09:00 WEST.

## What it is

A **strategy compiler** on top of 1inch's **SwapVM / Aqua**. Market makers describe what they want in plain language; we compile it into a safe SwapVM program, prove it with a simulation battery, deploy it live, and auto-retune it as the market moves.

- **2 new SwapVM opcodes:** `_inventorySkew2D` (two-sided inventory pricing) and `_oracleGuard2D` (maker-protection circuit breaker).
- **A deterministic compiler:** an LLM only parses intent into a bounded form (fixed options, clamped numbers). A fixed, non-AI compiler then does the security-critical ordering and composition (reject-and-rewrite). **The AI never writes code** — so a hallucination can't deploy a dangerous strategy.

## The three sponsor integrations — one product, three bounties

| Sponsor | Role in the product | Bounty track |
|---|---|---|
| **1inch SwapVM / Aqua** | The engine we extend: 2 new opcodes + the compiler on top | Build an Aqua App |
| **The Graph** | The agent's eyes — a first-party subgraph indexes `Swapped` events and triggers the autonomous retune | Best AI Use Case |
| **ENS** | Identity & trust — strategies are named subnames; agents resolve the name and verify the on-chain program-hash before swapping | Best ENS Integration for AI Agents |

## Repo contents

- `docs/strategy/` — pitch, build plan, tech stack, event runbook, and the plain-language + technical explainers.
- `docs/sponsors/` — sponsor research, including the SwapVM internals (how we add custom opcodes).
- _(contracts, the TS compiler, and the UI land here during the build.)_

## Read first

- **`docs/strategy/PITCH.md`** — the demo + Q&A armor.
- **`docs/strategy/PITCH-SEMPICE_ITA.md`** — the whole project explained in plain words (Italian), including the ready answer to "how do you turn human language into action?".

---

_Powered by SwapVM — © Degensoft Ltd 2025. License: `LicenseRef-Degensoft-SwapVM-1.1`._
