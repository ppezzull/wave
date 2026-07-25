# wave agent — top-level instructions

This agent layer turns natural-language market-making intents into on-chain
1inch SwapVM strategies, then monitors and (autonomously or via HITL) retunes
them.

**Ground truth:**
- `docs/strategy/AGENT.md` — canonical architecture (container, 5 agents, MCP
  tool surface, workflow HITL, policy plug-in).
- `docs/strategy/10-10-PLAYBOOK.md §1.5` — the Zod strategy spec (9 blocks).

**Agents:** `compose` (NL→spec) · `monitor` (subgraph→policy.decide) · `retune`
(autonomous dock→ship) · `ens` (resolve/verify/register) · `gate` (HITL queue).

**Policy is PURE functions in `src/policy/`** — no business logic in the MCP
layer. The retune set and the HITL set are disjoint: no approval path produces a
retune.
