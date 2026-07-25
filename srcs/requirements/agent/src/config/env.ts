// Env contract for the wave agent. `.env` is gitignored — see `.env.example`.
// Loaded via `dotenv/config` at entry points (index.ts, smoke, spike).

/** Required env var — throws clearly if missing. */
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`[env] missing required var: ${name}`);
  return v;
}

/** Self-hosted LLM (OpenAI-compatible vLLM endpoint, e.g. Gemma4-fast). */
export const llmConfig = () => ({
  // BASE url (…/v1), NOT …/chat/completions — the SDK appends the path itself.
  baseURL: required("ZAI_BASE_URL"),
  // vLLM often ignores this; the SDK requires the field to be present.
  apiKey: process.env.ZAI_API_KEY ?? "dummy",
  model: required("ZAI_MODEL"), // e.g. "qwen-haiku:4b"
  // craftshost/Langfuse only: the X-Langfuse-Public-Key header value. Undefined
  // for the direct Ollama endpoint (no public key needed there).
  publicKey: process.env.ZAI_PUBLIC_KEY,
  // TIER 2 #6 — call resilience. AI SDK v5 dropped the `timeout` CallSetting, so
  // the deadline is enforced via abortSignal (AbortSignal.timeout) in compose.agent.ts.
  // 90s: craftshost normal latency is 40-60s, stalls 60-120s → headroom over normal,
  // cuts the stall. maxRetries handles transient 5xx/429/connection (quick failures).
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 90_000),
  maxRetries: Number(process.env.LLM_MAX_RETRIES ?? 2),
});

/**
 * LibSQL storage. Durable by default: `file:./data.db` survives restarts, so HITL
 * workflow suspend/resume AND memory recall persist across process/container restarts.
 * Set LIBSQL_URL=:memory: for ephemeral smokes. (A1 / TIER 1 — was `:memory:`, which
 * lost all run + memory state on every restart.)
 */
export const storageConfig = () => ({
  url: process.env.LIBSQL_URL ?? "file:./data.db",
});

// PORT is read directly in mastra/index.ts (`server: { port: Number(process.env.PORT ?? 3002) }`)
// and defaulted to 3002 via ENV in the Dockerfile. (No serverConfig() helper — it was dead code.)
