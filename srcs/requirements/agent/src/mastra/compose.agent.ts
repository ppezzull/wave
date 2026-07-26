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
- Pick an oracle feed by SYMBOL (ETH/USD, BTC/USD, LINK/USD, USDC/USD, DAI/USD), never an address.
- amounts are human-readable decimal strings (e.g. "1.5", "3000").
- bps fields are basis points: 1.5% = 150 (not 1500); ceiling 1000.
- Emit nothing but the JSON object. No prose, no code, no markdown fences.`;

// Recall the last turns of conversation so the agent "remembers" prior strategies.
const composeMemory = new Memory({ options: { lastMessages: 20 } });

export const composeAgent = new Agent({
  id: "compose",
  name: "wave compose agent",
  instructions: COMPOSE_INSTRUCTIONS,
  model: gemmaModel(),
  memory: composeMemory,
});

/** Memory scope — (resource=user, thread=session). Pass to compose/composeStream for recall. */
export type ComposeScope = { resource: string; thread: string };

const generateOptions = (scope?: ComposeScope) => {
  // Fresh per call — AbortSignal.timeout arms at creation and is single-use, so it
  // must NOT be reused across compose() invocations (a fired signal stays aborted).
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
    // the stall guard is an abortSignal. Bounds compose() at timeoutMs → demo-safe:
    // a hung craftshost call can't hang the live demo past the deadline.
    abortSignal: AbortSignal.timeout(timeoutMs),
    ...(scope ? { memory: scope } : {}),
  };
};

/**
 * Parse a natural-language intent into a bounded StrategySpec.
 * Throws on schema drift (errorStrategy: 'strict'). Optional scope for memory recall.
 */
export async function compose(nl: string, scope?: ComposeScope): Promise<StrategySpec> {
  const res = await composeAgent.generate(nl, generateOptions(scope));
  if (!res.object) throw new Error("compose: model returned no structured object");
  // Mastra infers res.object from the schema's INPUT type, so maxStalenessSecs
  // (which uses .default(7200)) shows as optional here. zod applies the default
  // at parse → runtime always has it. Cast to the OUTPUT type is sound.
  return res.object as StrategySpec;
}

/**
 * Streaming parse — returns the Mastra stream; the UI/server consumes `fullStream`
 * for progressive form-fill (the "watch the AI fill the form" beat), and `.object`
 * for the final StrategySpec. Same strict schema as compose().
 */
export async function composeStream(nl: string, scope?: ComposeScope) {
  return composeAgent.stream(nl, generateOptions(scope));
}
