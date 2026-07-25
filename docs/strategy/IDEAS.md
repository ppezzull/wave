# Ranked Ideas

_Why this project and not others. (Decision made; the build plan is [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md).)_

## The meta-read
The prize board clusters into two games: **agentic payments** (Hedera, 0G, Graph AI tracks, Uniswap API, ENS AI — the most crowded space) and **deep DeFi engineering** (1inch SwapVM — hard, new, thin competition, maps directly onto the finalist Technicality axis). Winning move: **play both with one product.** Classic track ⇒ all Continuity-only prizes are ineligible.

## A. wave — Strategy Compiler ⭐ (chosen)
**Natural-language intent → deployed SwapVM strategy on Aqua, live, self-retuning.** Pitch: *"LPs can't express custom market-making logic without writing a VM program by hand — we compile their intent into one."* Two custom opcodes (`_inventorySkew2D`, `_oracleGuard2D`) extend SwapVM's instruction set; the safety loop is native (`quote()` = 100%-accurate off-chain simulation → compile → quote-simulate → invariant-check → ship). Prize picks (3 max): **1inch ($2.5k 1st) · Graph AI Use Case ($2k 1st) · ENS AI Agents ($1.5k)** ≈ $6k surface + finalist slot. Full design/build: [10-10-PLAYBOOK.md](./10-10-PLAYBOOK.md). Pitch + Q&A: [PITCH.md](./PITCH.md).

## B. Agent service economy (fallback — switch here only if the SwapVM core fails)
Agents register under ENS subnames (ENSIP-25/26), discover capabilities via text records, pay per call via x402 on Hedera, consume Graph data. Picks: Hedera Agentic ($3k) · Graph AI ($2k) · ENS AI ($1.5k). Hedera's rubric is a tickable checklist (ACP, x402, HCS-14). Faster build, very demoable — but the most crowded archetype, weak finalist differentiation.

## Why we don't chase the Uniswap $7k (biggest pot)
Lowest entry barrier (an API call) ⇒ biggest field; "trading agent on an API" adds nothing to finalist Technicality and needs FEEDBACK.md/audit overhead. On the 1inch track, even if the field is large, *deep opcode work with invariant tests* is rare — differentiation holds, and double-counts toward the finalist case. Uniswap also audits for "core functionality," which would bend the architecture toward the most crowded archetype. **Conditional:** only if ahead of schedule, add an inventory-hedging leg (rebalance `_inventorySkew2D` drift via Uniswap API) and swap ENS→Uniswap at the Sunday form. Default: keep ENS.

## World (not picked)
AgentKit ($8k) sounds aligned ("only human-backed agents ship"), but its "Will not qualify" list targets perk-style human-backing; our gate risks the excluded bucket unless framed as a trust-model change. Adds a whole identity stack competing for the same hours as the opcode work. Leave unless ahead of schedule. See [PITCH.md](./PITCH.md) sponsor lenses.
