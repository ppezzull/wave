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
  baseURL: required("LLM_BASE_URL"),
  // vLLM often ignores this; the SDK requires the field to be present.
  apiKey: process.env.LLM_API_KEY ?? "dummy",
  model: required("LLM_MODEL"), // e.g. "Gemma4-fast"
});

/** LibSQL storage. `:memory:` for smoke; a real URL for durable HITL workflow runs. */
export const storageConfig = () => ({
  url: process.env.LIBSQL_URL ?? ":memory:",
});

/** HTTP port the agent exposes (Next.js UI calls AGENT_URL=http://agent:<port>). */
export const serverConfig = () => ({
  port: Number(process.env.PORT ?? 3002),
});
