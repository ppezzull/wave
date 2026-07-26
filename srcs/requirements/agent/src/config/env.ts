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
 * LibSQL storage. Default `:memory:` is the container-safe choice — it needs no
 * writable volume and always boots. Durability (HITL suspend/resume + memory recall
 * surviving restarts) comes from setting `LIBSQL_URL=file:./data.db` in the DEPLOY
 * env, once the TIER 1 named volume + `env_file` are wired (compose). Opting in there
 * is a one-liner; defaulting to a file path here breaks the container build today
 * (no mounted volume → unbootable / state lost each restart anyway).
 */
export const storageConfig = () => ({
  url: process.env.LIBSQL_URL ?? ":memory:",
});

/**
 * Announcer key — the agent announces strategies from the router OWNER EOA.
 *
 * `EnsStrategyRouter.announceStrategy()` is `onlyOwner`: a key that does NOT
 * derive to the owner reverts on stage (Beat B), not at compile. We validate at
 * boot so we fail-fast with a clear message instead of a mysterious runtime revert.
 *
 * Key source: `ANNOUNCER_PRIVATE_KEY` (falls back to the existing `SEPOLIA_PRIVATE_KEY`
 * / `MAKER_PRIVATE_KEY` so the shared faucet key works unchanged). NEVER logged,
 * committed, or pasted — only the derived address is exposed.
 */
export const EXPECTED_ANNOUNCER_OWNER =
  "0x2058C253029bB0Cf1E1aD43DfAEF63D658A8dddf" as const;

export interface AnnouncerConfig {
  address: `0x${string}`; // derived EOA (== EXPECTED_ANNOUNCER_OWNER after validation)
  owner: `0x${string}`; // expected router owner
}

/** Read + validate the announcer key. Throws a clear error on missing/mismatch. */
export async function announcerConfig(): Promise<AnnouncerConfig & { privateKey: `0x${string}` }> {
  const raw =
    process.env.ANNOUNCER_PRIVATE_KEY ??
    process.env.SEPOLIA_PRIVATE_KEY ??
    process.env.MAKER_PRIVATE_KEY;
  if (!raw || raw.length === 0) {
    throw new Error(
      `[env] ANNOUNCER_PRIVATE_KEY missing — set it (or SEPOLIA_PRIVATE_KEY) in agent/.env. ` +
        `It must derive to the router owner ${EXPECTED_ANNOUNCER_OWNER}.`,
    );
  }
  const { privateKeyToAccount } = await import("viem/accounts");
  let address: `0x${string}`;
  try {
    address = privateKeyToAccount(raw as `0x${string}`).address;
  } catch {
    throw new Error("[env] ANNOUNCER_PRIVATE_KEY is not a valid 0x-prefixed secp256k1 private key.");
  }
  if (address.toLowerCase() !== EXPECTED_ANNOUNCER_OWNER.toLowerCase()) {
    throw new Error(
      `[env] ANNOUNCER key derives to ${address}, NOT the router owner ${EXPECTED_ANNOUNCER_OWNER}. ` +
        `announceStrategy() is onlyOwner — a wrong key reverts on stage. Fix agent/.env.`,
    );
  }
  return { privateKey: raw as `0x${string}`, address, owner: EXPECTED_ANNOUNCER_OWNER };
}

// PORT is read directly in mastra/index.ts (`server: { port: Number(process.env.PORT ?? 3002) }`)
// and defaulted to 3002 via ENV in the Dockerfile. (No serverConfig() helper — it was dead code.)
