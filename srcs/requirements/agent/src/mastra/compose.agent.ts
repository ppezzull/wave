// composeAgent — Beat A: natural-language → StrategySpec (Zod, bounded).
//
// The LLM fills a FORM; it writes no code. Unknown block types and out-of-range
// numbers are rejected by the Zod schema (src/schema.ts), never invented.
// Memory is attached so the agent RECALLS recent turns of the conversation — short-term
// recall scoped per (resource=user, thread=session) at call time. This is NOT learning:
// the agent doesn't adapt its behavior, instructions, or thresholds; it only re-reads
// recent history when the caller passes a scope (compose/composeStream + the HITL workflow).
//
// Spec: docs/strategy/AGENT.md (composeAgent) + docs/strategy/10-10-PLAYBOOK.md §1.5.
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { gemmaModel } from "./llm.js";
import { llmConfig } from "../config/env.js";
import { StrategySpec } from "../schema.js";

const COMPOSE_INSTRUCTIONS = `You are wave's strategy composer. Given one natural-language market-making intent, emit a single JSON object matching the StrategySpec schema (specVersion 1, then pair, size, and an ordered blocks array).

Rules:
- Fill ONLY fields the schema allows. Unknown block types, unknown enum values, and out-of-range numbers must be OMITTED, never invented.
- pair.token0 and pair.token1 are 0x-prefixed 40-hex ADDRESSES — take them VERBATIM from the input intent; NEVER use a symbol like "ETH" there. If the input omits addresses, you cannot fill the pair.
- Oracle guard feed is a Chainlink USD feed and MUST be exactly one of: "ETH/USD", "BTC/USD", "LINK/USD", "USDC/USD", "DAI/USD". For an ETH/USDC pair, use "ETH/USD" — NEVER use "ETH/USDC".
- amounts are human-readable decimal strings (e.g. "1.5", "3000").
- bps fields are basis points: 1.5% = 150 (not 1500); ceiling 1000.
- Emit nothing but the JSON object. No prose, no code, no markdown fences.`;

// Recall the last turns of conversation so the agent "remembers" prior strategies.
const composeMemory = new Memory({ options: { lastMessages: 20 } });

/**
 * Fresh per call — AbortSignal.timeout is single-use (a fired signal stays aborted),
 * so this MUST be a factory, never a frozen object on the Agent.
 *
 * Also applied as `defaultOptions` so Mastra's HTTP `/api/agents/composeAgent/stream`
 * (what the UI proxies) gets structuredOutput — without this, the generic stream path
 * is freeform chat and never emits `object` chunks (blank form in the create drawer).
 */
const composeExecutionOptions = () => {
  const { timeoutMs, maxRetries } = llmConfig();
  return {
    structuredOutput: {
      schema: StrategySpec,
      jsonPromptInjection: "auto" as const, // deepseek-coder-v2 is non-OpenAI → prompt-injection
      errorStrategy: "strict" as const, // schema drift must throw, not silently coerce
    },
    // temperature/maxOutputTokens/maxRetries live under modelSettings (NOT top-level).
    // maxRetries: transient 5xx/429/connection retries (AI SDK default is 2).
    modelSettings: { temperature: 0, maxOutputTokens: 1000, maxRetries },
    // TIER 2 #6 — hard deadline. AI SDK v5 dropped the `timeout` CallSetting, so
    // the stall guard is an abortSignal. Bounds compose at timeoutMs → demo-safe:
    // a hung craftshost call can't hang the live demo past the deadline.
    abortSignal: AbortSignal.timeout(timeoutMs),
  };
};

export const composeAgent = new Agent({
  id: "compose",
  name: "wave compose agent",
  instructions: COMPOSE_INSTRUCTIONS,
  model: gemmaModel(),
  memory: composeMemory,
  // Mastra's AgentConfig resolves `defaultOptions` through a second copy of
  // StandardSchema types; our installed zod/v4 schema is runtime-compatible
  // (and used directly by generateOptions below) but does not satisfy that
  // duplicate declaration structurally. Keep the cast at this integration
  // boundary so the HTTP auto-route still receives structured output.
  defaultOptions: composeExecutionOptions as never,
});

/** Memory scope — (resource=user, thread=session). Pass to compose/composeStream for recall. */
export type ComposeScope = { resource: string; thread: string };

const LOG = "[wave:compose]";

const generateOptions = (scope?: ComposeScope) => ({
  ...composeExecutionOptions(),
  ...(scope ? { memory: scope } : {}),
});

function intentMeta(nl: string, scope?: ComposeScope) {
  return {
    intentChars: nl.length,
    has0xAddress: /0x[a-fA-F0-9]{40}/.test(nl),
    preview: nl.replace(/\s+/g, " ").trim().slice(0, 120),
    scope: scope ?? null,
  };
}

function specSummary(spec: StrategySpec | null | undefined) {
  if (!spec) return null;
  const s = spec as {
    pair?: unknown;
    size?: unknown;
    blocks?: Array<{ type?: string }>;
  };
  return {
    pair: s.pair ?? null,
    size: s.size ?? null,
    blocks: Array.isArray(s.blocks) ? s.blocks.map((b) => b.type) : [],
  };
}

/**
 * Parse a natural-language intent into a bounded StrategySpec.
 * Throws on schema drift (errorStrategy: 'strict'). Optional scope for memory recall.
 */
export async function compose(nl: string, scope?: ComposeScope): Promise<StrategySpec> {
  const t0 = Date.now();
  console.info(LOG, "compose() start", intentMeta(nl, scope));
  try {
    const res = await composeAgent.generate(nl, generateOptions(scope));
    if (!res.object) throw new Error("compose: model returned no structured object");
    // Mastra infers res.object from the schema's INPUT type, so maxStalenessSecs
    // (which uses .default(7200)) shows as optional here. zod applies the default
    // at parse → runtime always has it. Cast to the OUTPUT type is sound.
    const object = res.object as StrategySpec;
    console.info(LOG, "compose() ok", { ms: Date.now() - t0, spec: specSummary(object) });
    return object;
  } catch (err) {
    console.error(LOG, "compose() fail", { ms: Date.now() - t0, err: String(err) });
    throw err;
  }
}

/**
 * Streaming parse — returns the Mastra stream; the UI/server consumes `fullStream`
 * for progressive form-fill (the "watch the AI fill the form" beat), and `.object`
 * for the final StrategySpec. Same strict schema as compose().
 */
export async function composeStream(nl: string, scope?: ComposeScope) {
  console.info(LOG, "composeStream() start", intentMeta(nl, scope));
  return composeAgent.stream(nl, generateOptions(scope));
}
