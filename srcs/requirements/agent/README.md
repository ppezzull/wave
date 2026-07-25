# wave agent

The AI/agent layer of wave: turns a natural-language market-making intent into an
on-chain 1inch SwapVM strategy, with human-in-the-loop approval. Built on
[Mastra](https://mastra.ai) (Apache-2.0, self-hosted).

- **Owner:** Flavio (P2)
- **Spec:** [`docs/strategy/AGENT.md`](../../../docs/strategy/AGENT.md) (canonical) · [`docs/tasks/Flavio.md`](../../../docs/tasks/Flavio.md)
- **PR:** [#21](https://github.com/ppezzull/wave/pull/21) · **Compiler contract:** [`../compiler/src/ast.ts`](../compiler/src/ast.ts) (frozen, specVersion 1)

## Status (post-PR #21)

| Piece | Status |
|---|---|
| **compose** — NL → StrategySpec (Zod) | ✅ live-validated |
| **Memory** (recall — "l'agente impara") | ✅ |
| **Streaming** (`composeStream`) | ✅ |
| **Workflow HITL** (propose → suspend → `/review` → resume) | ✅ live-validated |
| **Policy** — pure `decide()` + triggers (R1–R4 / S1–S4 / M1 / E1,E3) | ✅ 11 tests |
| **Schema** — `StrategySpec` mirroring the `ast.ts` freeze | ✅ 15 tests |
| **MCP** — 9 read tools (`mcp__wave__*`) | ✅ |
| monitor / retune / ens / gate **agent actions** | 🔒 blocked |
| `register` / `resolveVerify` (ENS) | 🔒 blocked |
| `recompileAndShip` | 🔒 blocked |
| real clients (subgraph / aqua / router / ens) | 🔒 stubs (throw) |

Blocked on Pietro's subgraph + Flaviano's Solidity freezes — see [What I need](#what-i-need-from-the-team).

## The LLM (important)

**Model: `deepseek-coder-v2:16b-lite-instruct-q4_K_M`** — the only server model that is **non-thinking** (`reasoning` = 0) and reliably emits valid structured JSON. Verified: `compose()` returns a valid StrategySpec end-to-end.

**Why not the others (all tested, broken for structured output):**
- `gemma4-fast`, `fast-nt`, `gemma4-coder`, `qwen3` — **thinking models**. `think:false` (both `chat_template_kwargs` and top-level) AND the `/no_think` directive do **not** disable their reasoning (~6700 tokens) → burns the whole token budget → content EMPTY (low `max_tokens`) or ~112s/call (huge). Unusable live.
- `qwen-haiku:4b` — too weak (4B) → `compose()` returns `undefined`.

**Endpoint — craftshost gateway** (`https://openai.craftshost.com`, OpenAI-compatible, Langfuse-traced, Cloudflare-fronted). Auth (wired in [`src/mastra/llm.ts`](src/mastra/llm.ts) via `createOpenAICompatible({ headers })`):
- `Authorization: Bearer <ZAI_API_KEY>` = Langfuse **secret** key (`sk-lf-…`)
- `X-Langfuse-Public-Key: <ZAI_PUBLIC_KEY>` = Langfuse **public** key (`pk-lf-…`)
- `User-Agent: <browser>` — **required**; Cloudflare blocks non-browser clients (error 1010)
- The direct Ollama endpoint (`100.114.143.24:11434` via Tailscale) also works (no auth/UA needed) — craftshost is the public/portable one
- Latency ~40–60s/call via craftshost (gateway + server load); non-thinking, so it scales with output, not reasoning

`.env` (gitignored — copy `.env.example`):
```dotenv
ZAI_BASE_URL=https://openai.craftshost.com/v1
ZAI_API_KEY=sk-lf-…        # Langfuse secret key
ZAI_PUBLIC_KEY=pk-lf-…     # Langfuse public key
ZAI_MODEL=deepseek-coder-v2:16b-lite-instruct-q4_K_M
LIBSQL_URL=:memory:        # a real libsql URL for durable HITL workflow runs
PORT=3002
```

## Architecture

```
src/
├── schema.ts                       # StrategySpec — MIRRORS compiler/ast.ts (freeze)
├── config/env.ts                   # ZAI_* env contract
├── mastra/
│   ├── index.ts                    # Mastra registry (agents + workflow + storage + MCPServer)
│   ├── llm.ts                      # craftshost provider (auth + browser UA + think:false)
│   ├── compose.agent.ts            # composeAgent + compose() + composeStream() + Memory
│   └── workflows/strategy.workflow.ts   # HITL: NL → compose → suspend → resume(approve)
├── mcp/{reads,server}.ts           # 9 mcp__wave__* read tools (readOnlyHint)
├── policy/{triggers,decide,thresholds,types,index}.ts   # pure retune/stop/remove policy
├── clients/{subgraph,ens,aqua,router}.ts               # STUBS (throw until wired)
├── compose.smoke.ts | hitl.smoke.ts | mastra.boots.ts  # live smokes
└── test/{policy,schema,schema.fuzz}.test.ts            # 28 tests (no LLM)
```

## Run / test (from this dir: `srcs/requirements/agent/`)

```bash
npm install
npm run typecheck          # tsc --noEmit
npm run test               # vitest — 28 tests, no LLM, no network
npm run spike              # deepseek-coder-v2 structured-output check (live, needs .env)
npx tsx src/mastra.boots.ts    # Mastra registry + storage + MCPServer construct (no LLM)
npx tsx src/compose.smoke.ts   # compose() NL → StrategySpec (live)
npx tsx src/hitl.smoke.ts      # HITL workflow: propose → suspend → resume(approve) (live)
```

## compose contract (for the compiler / UI)

- `compose(nl, scope?) → StrategySpec` — throws on schema drift; `scope = { resource, thread }` enables memory recall.
- `composeStream(nl, scope?) → stream` — UI consumes `fullStream` for progressive form-fill, `.object` for the final StrategySpec.
- ⚠️ **The input intent MUST include the pair token ADDRESSES** (`token0`/`token1` are `0x…`, not symbols like "ETH") — else the model emits symbols and Zod rejects.
- **Schema = the `ast.ts` freeze** (specVersion 1): lowerCamel block kinds, 5 feeds, `maxStalenessSecs` 1..65535, `concentration`/`decay`/`salt` bodies defined. This is the LLM shape; Flaviano's compiler scales (`targetRatio`→1e18, prices→sqrt 1e18) and resolves symbols → addresses.

## What I need from the team

**Flaviano** (freezes, pre-kickoff — PR #19 was only `ast.ts`; these are the rest):
1. `EnsStrategyRouter.sol` + `StrategyDeployed(strategyId, programHash, ensNode)` **ABI** → unblocks `resolveVerify.ts` (the G1 hash-verify dealbreaker).
2. `programHash()` → unblocks `register.ts` (writes `v0.programhash`) + the round-trip hash-chain CI test (G3).
3. `dock()`/`ship()` signature + Sepolia router address → unblocks `recompileAndShip()` (the retune action arm, G2).

**Pietro:**
- The Sepolia **subgraph endpoint** (+ `eth_getLogs` fallback) → unblocks `graphDelta.ts`, the evidence log, and the zero-click retune (G2 dealbreaker). Flavio owns the decision layer (`policy.decide()`); Pietro owns the endpoint + retune surface.

## PR #21 — what's in it

`feat/agent-schema-freeze` (3 commits):
1. `f00f651` — align `schema.ts` to the frozen `ast.ts` (#19): kebab→lowerCamel, feeds 3→5, `maxStalenessSecs`→65535, `concentration`/`decay`/`salt` bodies, `DecimalAmount`, refines.
2. `32a0354` — compose works end-to-end: deepseek-coder-v2 + craftshost auth (Bearer sk + X-Langfuse-Public-Key pk + browser UA) + prompt fixes (pair=addresses, maxTokens 1000).
3. `c49c0cb` — memory + streaming (`composeStream`) + the HITL workflow (propose→suspend→resume).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
