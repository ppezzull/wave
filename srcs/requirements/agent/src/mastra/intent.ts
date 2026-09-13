// intent.ts — the router in front of the two chat lanes (assistant vs. strategy).
//
// composeAgent is a FORM-filler: every message through it becomes a StrategySpec, so
// "what's a curve block?" used to die at the UI proxy's 422 or derail the schema. The
// lane is decided FIRST; only genuine strategy intent reaches the strict compose flow.
//
// Three tiers, cheapest first:
//   1. fast path   — ≥2 0x addresses ⇒ strategy. Definitive, zero extra latency — the
//                    canonical demo path (paste with both addresses) pays nothing.
//   2. LLM classify — one tiny structured call (temperature 0, ~100 tokens, 15s deadline).
//   3. heuristic   — classifier failure (timeout/5xx/schema drift) degrades to keywords,
//                    biased to "assistant": the user asked for a general assistant, not a
//                    stricter compiler. A missed strategy request asks the user to say it
//                    again; a wrongly-compiled form is worse.
import { Agent } from "@mastra/core/agent";
import { z } from "zod/v4";
import { gemmaModel } from "./llm.js";

export const IntentDecision = z.object({
  mode: z.enum(["assistant", "strategy"]),
});
export type IntentDecision = z.infer<typeof IntentDecision>;
export type ChatMode = IntentDecision["mode"];

const LOG = "[wave:intent]";

const ROUTER_INSTRUCTIONS = `You are the intent router for wave — a social market where users describe on-chain market-making strategies in plain English, and the agent compiles, safety-checks, and ships them.

Classify the user's latest message into exactly one lane:
- "strategy": the user wants a strategy CREATED NOW. Actionable build requests — a pair, sizes, or liquidity provisioning with intent to act ("make a WETH/USDC market maker", "create a strategy for 0x… and 0x…, 5 and 3000").
- "assistant": everything else — questions about wave or market making, explanations, greetings, feedback, discussion, half-formed ideas ("what's a curve block?", "I'm thinking about ETH/USDC", "hi").

Ambiguity resolves to "assistant": a message that merely MENTIONS strategies is conversation; only a message that ASKS for one to be built is strategy. Reply with the JSON object only.`;

const intentRouterAgent = new Agent({
  id: "intent-router",
  name: "wave intent router",
  instructions: ROUTER_INSTRUCTIONS,
  model: gemmaModel(),
});

/** The definitive, free signal: a build request carries both token addresses. */
export function fastLane(nl: string): ChatMode | null {
  const addresses = nl.match(/0x[a-fA-F0-9]{40}/g) ?? [];
  return addresses.length >= 2 ? "strategy" : null;
}

/**
 * Keyword fallback when the classifier is unreachable. Two-way AND (creation verb +
 * strategy subject) keeps "I need help understanding strategies" out of the compile lane.
 */
export function heuristicIntent(nl: string): IntentDecision {
  if (fastLane(nl)) return { mode: "strategy" };
  const creation = /\b(create|build|make|ship|deploy|compile|launch|set up|give me|i want|i need)\b/i;
  const subject = /\b(strategy|strategies|market.?mak|liquidity|pair|pool|position)\b/i;
  return { mode: creation.test(nl) && subject.test(nl) ? "strategy" : "assistant" };
}

/** One tiny structured call. Throws on timeout/5xx/schema drift — caller falls back. */
export async function classifyIntent(nl: string): Promise<IntentDecision> {
  const res = await intentRouterAgent.generate(nl, {
    structuredOutput: {
      schema: IntentDecision,
      jsonPromptInjection: "auto", // same non-OpenAI model as compose — prompt injection
      errorStrategy: "strict",
    },
    modelSettings: { temperature: 0, maxOutputTokens: 100 },
    abortSignal: AbortSignal.timeout(15_000),
  });
  if (!res.object) throw new Error("intent router returned no object");
  return res.object as IntentDecision;
}

/** All three tiers in order — the route calls this and logs `how`. */
export async function resolveLane(nl: string): Promise<{ mode: ChatMode; how: string }> {
  const fast = fastLane(nl);
  if (fast) return { mode: fast, how: "fast:addresses" };
  const t0 = Date.now();
  try {
    const decision = await classifyIntent(nl);
    return { mode: decision.mode, how: `llm:${Date.now() - t0}ms` };
  } catch (err) {
    console.warn(LOG, "classifier failed → heuristic:", String(err));
    return { mode: heuristicIntent(nl).mode, how: "heuristic" };
  }
}
