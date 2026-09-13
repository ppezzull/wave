// assistantAgent — the conversational lane. General-purpose: answers questions,
// explains wave/market-making, helps shape ideas — everything that is NOT "compile
// this now" (that lane stays composeAgent's strict StrategySpec flow).
//
// NO structuredOutput: this agent streams plain text. The lane split happens in
// routes/chat-stream.ts (intent.ts classifies); both agents SHARE composeMemory so
// the conversation is one thread across lanes — the assistant recalls the spec it
// just helped shape, and compose recalls the discussion that preceded it.
import { Agent } from "@mastra/core/agent";
import { gemmaModel } from "./llm.js";
import { llmConfig } from "../config/env.js";
import { composeMemory, type ComposeScope } from "./compose.agent.js";

const ASSISTANT_INSTRUCTIONS = `You are wave's assistant. wave is a social market for on-chain market-making strategies: a user describes a strategy in plain English, the composer compiles it into a bounded StrategySpec, a deterministic compiler lowers it to 1inch SwapVM bytecode, and shipping requires an explicit approval (Ledger hardware gate or wallet signature) before anything lands on-chain.

You are the conversational lane: explain, advise, discuss. You can:
- explain how wave works (describe → compile → safety check → approve → on-chain),
- explain strategy blocks (curve/xyc, oracle guard, inventory skew, decay, fees) and SwapVM concepts,
- discuss market making (spreads, inventory risk, quote skew, oracle staleness),
- help the user shape an idea into something compilable — when they seem ready to build, remind them the compiler needs BOTH token addresses (0x…) and both sizes.

Style: plain prose, 1–5 short sentences. No headings, no bullet lists unless asked. No filler openers. You cannot execute trades, move funds, or promise returns, and you have no tools — for anything that changes state, tell the user what to type.`;

/**
 * Fresh per call (AbortSignal.timeout is single-use — see compose.agent.ts).
 * Freeform: no structuredOutput, warmer temperature, bounded length. Same
 * memory scope as the compose lane so both lanes read one conversation.
 */
const assistantOptions = (scope?: ComposeScope) => {
  const { timeoutMs, maxRetries } = llmConfig();
  return {
    ...(scope ? { memory: scope } : {}),
    modelSettings: { temperature: 0.4, maxOutputTokens: 700, maxRetries },
    abortSignal: AbortSignal.timeout(timeoutMs),
  };
};

export const assistantAgent = new Agent({
  id: "assistant",
  name: "wave assistant",
  instructions: ASSISTANT_INSTRUCTIONS,
  model: gemmaModel(),
  memory: composeMemory,
});

export type AssistantScope = ComposeScope;

/** Non-streaming generate (tests / one-shot callers). */
export async function assist(text: string, scope?: AssistantScope) {
  const res = await assistantAgent.generate(text, assistantOptions(scope));
  return res.text;
}

/** Streaming — routes/chat-stream.ts forwards `fullStream` chunks to the UI verbatim. */
export async function assistStream(text: string, scope?: AssistantScope) {
  return assistantAgent.stream(text, assistantOptions(scope));
}
