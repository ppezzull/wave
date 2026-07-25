# HANDOFF — wave agent layer (Flavio / P2)

Self-contained context to continue this work in another chat. Read this first.
Repo: `~/Desktop/wave` (git, branch `feat/agent-schema-freeze`). Event: ETHGlobal Lisboa 2026.

## TL;DR
**wave** = NL market-making intent → on-chain 1inch SwapVM strategy. **Flavio (P2)** owns the
agentic layer (Mastra): NL→StrategySpec (compose), HITL approval, the monitor→policy→retune
decision layer. Built on **Mastra** (Apache-2.0, self-hosted). Canonical spec:
[`docs/strategy/AGENT.md`](../../../docs/strategy/AGENT.md); tasks: [`docs/tasks/Flavio.md`](../../../docs/tasks/Flavio.md).

**State:** the **LLM-agentic core is DONE + live-validated**; **deploy (TIER 0) DONE**; the
data/action/ENS half is **blocked on teammate freezes**.

## Branches / PRs
- **PR #21** `feat/agent-schema-freeze` (OPEN, Flavio's) — 5 commits:
  1. `f00f651` align `schema.ts` to the frozen `ast.ts`
  2. `32a0354` compose works end-to-end (deepseek-coder-v2 + craftshost)
  3. `c49c0cb` memory + streaming + HITL workflow
  4. `38ad6b4` agent README
  5. `238ea9b` TIER 0 deploy (mastra server + Dockerfile)
- **PR #19** (Flaviano, APPROVED) — the frozen `ast.ts` (StrategySpec specVersion 1). Only the AST;
  the router/ABI/programHash/dock-ship are NOT in it (still pending).
- Working tree on the branch is clean (modulo gitignored `.env`, `.mastra/`, local tooling).

## What's built (agent layer) — status
| Piece | Status | Where |
|---|---|---|
| `compose()` NL → StrategySpec (Zod, strict) | ✅ live | `src/mastra/compose.agent.ts` |
| Memory (recall, `lastMessages:20`) | ✅ | compose.agent.ts |
| `composeStream()` (progressive form-fill) | ✅ | compose.agent.ts |
| Workflow HITL (propose→suspend→`/review`→resume) | ✅ live | `src/mastra/workflows/strategy.workflow.ts` |
| Policy `decide()` + triggers (R1–R4/S1–S4/M1/E1,E3) | ✅ 11 tests | `src/policy/` |
| Schema `StrategySpec` mirroring `ast.ts` freeze | ✅ 15 tests | `src/schema.ts` |
| 9 MCP read tools (`mcp__wave__*`) | ✅ | `src/mcp/{reads,server}.ts` |
| Clients (subgraph/aqua/router/ens) | 🔒 stubs (throw) | `src/clients/` |
| Deploy: mastra server + Dockerfile + `/health` | ✅ TIER 0 | `index.ts`, `Dockerfile` |

## The LLM (critical context)
**Model: `deepseek-coder-v2:16b-lite-instruct-q4_K_M`** — the ONLY server model that is
**non-thinking** (`reasoning`=0) and reliably emits valid structured JSON. Verified: `compose()`
returns a valid StrategySpec.

**Do NOT switch to (tested, broken):**
- `gemma4-fast`, `fast-nt`, `gemma4-coder`, `qwen3` — **thinking models**. `think:false`
  (`chat_template_kwargs` + top-level) AND `/no_think` directive do NOT disable reasoning
  (~6700 tokens) → burns the token budget → content EMPTY (low max_tokens) or ~112s (huge).
- `qwen-haiku:4b` — too weak (4B) → `undefined`.

**Endpoint — craftshost gateway** (`https://openai.craftshost.com`, OpenAI-compat, Langfuse-traced,
Cloudflare-fronted). Auth wired in `src/mastra/llm.ts` (`createOpenAICompatible({ headers })`):
- `Authorization: Bearer <ZAI_API_KEY>` = Langfuse **secret** (`sk-lf-…`)
- `X-Langfuse-Public-Key: <ZAI_PUBLIC_KEY>` = Langfuse **public** (`pk-lf-…`)
- `User-Agent: <browser>` — **required** (Cloudflare blocks bots, error 1010)
- Direct Ollama (`100.114.143.24:11434` via Tailscale) also works (no auth/UA).
- Latency ~40–60s/call via craftshost; non-thinking (scales w/ output, not reasoning).

`.env` (gitignored — copy `.env.example`):
```
ZAI_BASE_URL=https://openai.craftshost.com/v1
ZAI_API_KEY=sk-lf-…        # Langfuse secret
ZAI_PUBLIC_KEY=pk-lf-…     # Langfuse public
ZAI_MODEL=deepseek-coder-v2:16b-lite-instruct-q4_K_M
LIBSQL_URL=:memory:        # use file:./data.db + volume for durable HITL (TIER 1)
PORT=3002
```

## Schema = compiler freeze
`src/schema.ts` **mirrors** `srcs/requirements/compiler/src/ast.ts` (PR #19, specVersion 1):
lowerCamel block kinds (`oracleGuard`, `inventorySkew`, …), 5 feeds (ETH/BTC/LINK/USDC/DAI USD),
`maxStalenessSecs` 1..65535, `maxDeviationBps`≥1, `concentration`={priceMin,priceMax},
`decay`={periodSecs}, `salt`={value}, `DecimalAmount`, refines (token0≠token1, amounts≠0).
LLM shape; the compiler scales + resolves symbols→addresses.

## Deploy (TIER 0 — done)
- `index.ts`: `server: { port: Number(process.env.PORT ?? 3002) }` (direct, not a factory —
  `mastra build` statically extracts it).
- `mastra build` → **self-contained** `.mastra/output/` (bundle + its own `node_modules` +
  `package.json`). Run: `node .mastra/output/index.mjs` → serves `/health` (200) + `/api/*` +
  auto-mounted MCP HTTP/SSE.
- `Dockerfile`: multi-stage (build `npm ci`+`mastra build` → runtime copies output, `USER node`,
  `EXPOSE 3002`, `HEALTHCHECK` on `/health`).
- `.dockerignore` excludes `.env*` (secrets), `.mastra`, `node_modules`. `.gitignore` has `.mastra/`.

## Run / test (from `srcs/requirements/agent/`)
```bash
npm install
npm run typecheck          # tsc --noEmit  (clean)
npm run test               # vitest — 28 tests, no LLM/network
npm run spike              # deepseek structured-output check (live, needs .env)
npm run dev                # mastra dev — Studio (localhost:4111) + API
npm run build              # mastra build → .mastra/output/
node .mastra/output/index.mjs   # start the built server
npx tsx src/compose.smoke.ts    # compose() NL→StrategySpec (live)
npx tsx src/hitl.smoke.ts       # HITL workflow propose→suspend→resume (live)
```

## Deployment hardening — status (from a production review)
- **TIER 0 (deploy blocker) — DONE** ✅ (server, Dockerfile, build, /health).
- **TIER 1 (prod landmines) — PENDING:**
  - #3 kill `:memory:` → file LibSQL (`file:./data.db` + named compose volume) for durable HITL.
  - #4 wire `env_file: [.env]` on the `agent` compose service (currently commented out) + confirm `.env*` in `.dockerignore` (done).
  - #5 remove the dev `./requirements/agent:/app` bind-mount in the prod compose profile.
- **TIER 2 (hardening):**
  - **#6 LLM timeout — NEXT, demo-critical.** `compose()` has NO timeout; craftshost stalls 60-120s
    (seen) → a hung call blocks forever → crashes the live demo. Add `AbortController`+deadline+`maxRetries`.
  - #7 Memory explicit storage (`mastra.getStorage()`) — probably already via instance storage; low priority.
  - #8 Auth/CORS on `/api/*` — isolated compose network → defer for demo; MUST when write tools (retune/ship) land.
  - #9 MCP stateful (don't set `serverless:true`) — long-running container. Easy.
  - #10 `NODE_ENV=production` + healthcheck in compose; no `ports:` mapped (bridge net, UI via `http://agent:3002`).
- **TIER 3 — SKIP** (Inngest/OTLP/replicas = overkill for the hackathon).

## Blocked — teammate freezes (NOT in PR #19)
| Flavio task | Blocker |
|---|---|
| `resolveVerify.ts` (hash-verify, G1 dealbreaker) | Flaviano: `EnsStrategyRouter` + `StrategyDeployed` **ABI** |
| `register.ts` (writes `v0.programhash`) + hash-chain CI (G3) | Flaviano: `programHash()` |
| `recompileAndShip()` (retune action arm, G2) | Flaviano: `dock()`/`ship()` + router address |
| `graphDelta.ts`, evidence log, zero-click retune (G2 dealbreaker) | Pietro: Sepolia **subgraph endpoint** (+ `eth_getLogs` fallback) |

Flavio owns the **decision layer** (`policy.decide()`); `graphDelta.ts` skeleton (stub data → decide → trigger → log) is buildable now — swap the data source when Pietro's endpoint lands.

## Key decisions + gotchas
- **think:false is a no-op on the thinking models** — don't rely on it; use `deepseek-coder-v2`.
- **compose input MUST carry pair token ADDRESSES** (`token0`/`token1` = `0x…`, not "ETH") — else the model emits symbols and Zod rejects. See `compose.smoke.ts`.
- **`.env` cwd gotcha:** `dotenv/config` loads from `process.cwd()`, NOT the module dir. There's a
  root `.env` (stale) AND `agent/.env`. Run agent commands **from `srcs/requirements/agent/`**
  (or `npm --prefix … run <script>`, which sets cwd=prefix) so the right `.env` loads.
- **mastra CLI = the `mastra` npm package** (devDep), NOT `@mastra/cli`.
- `compose.agent.ts` casts `res.object as StrategySpec` (Mastra infers the INPUT type; `maxStalenessSecs.default(7200)` makes input-optional vs output-required; runtime always has it).
- `modelSettings` (temperature/maxOutputTokens) on `agent.generate`/`.stream`, NOT top-level; `jsonPromptInjection:"auto" as const` + `errorStrategy:"strict" as const` (literals — `as const` avoids TS widening).

## Immediate next steps
1. **TIER 2 #6 — LLM timeout** on `compose`/`composeStream` (`AbortController` + deadline + `maxRetries`). Demo-critical.
2. **TIER 1** — compose wiring: `env_file`, file-storage + volume, prod mount off.
3. **`graphDelta.ts` + `evidence/log.ts`** skeleton (stub data → `policy.decide()` → trigger → log) — advances the G2 retune path; swap source when Pietro lands.
4. Then blocked on Flaviano's router ABI / `programHash()` / `dock()`-`ship()` + Pietro's subgraph.

## Key files
```
srcs/requirements/agent/
├── README.md                         # full team doc (status, LLM, architecture, blockers)
├── HANDOFF.md                        # THIS file
├── Dockerfile / .dockerignore        # TIER 0 deploy
├── package.json                      # mastra CLI + dev/build/start scripts
└── src/
    ├── schema.ts                     # StrategySpec (mirrors compiler/ast.ts freeze)
    ├── compose.smoke.ts | hitl.smoke.ts | mastra.boots.ts   # live smokes
    ├── config/env.ts                 # ZAI_* env contract
    ├── mastra/{index,llm,compose.agent}.ts + workflows/strategy.workflow.ts
    ├── mcp/{reads,server}.ts         # 9 mcp__wave__* read tools
    ├── policy/{triggers,decide,thresholds,types,index}.ts   # pure policy
    ├── clients/{subgraph,ens,aqua,router}.ts                # STUBS
    └── test/{policy,schema,schema.fuzz}.test.ts             # 28 tests
```
