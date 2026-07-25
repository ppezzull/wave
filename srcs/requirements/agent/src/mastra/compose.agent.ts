// composeAgent — Beat A: natural-language → StrategySpec (Zod, bounded).
//
// The LLM fills a FORM; it writes no code. Unknown block types and out-of-range
// numbers are rejected by the Zod schema (src/schema.ts), never invented.
// This is the LLM-facing DRAFT; Flaviano's compiler turns the ordered blocks
// into SwapVM opcodes.
//
// Spec: docs/strategy/AGENT.md (composeAgent) + docs/strategy/10-10-PLAYBOOK.md §1.5.
import { Agent } from "@mastra/core/agent";
import { gemmaModel } from "./llm.js";
import { StrategySpec } from "../schema.js";

const COMPOSE_INSTRUCTIONS = `You are wave's strategy composer. Given one natural-language market-making intent, emit a single JSON object matching the StrategySpec schema (specVersion 1, then pair, size, and an ordered blocks array).

Rules:
- Fill ONLY fields the schema allows. Unknown block types, unknown enum values, and out-of-range numbers must be OMITTED, never invented.
- Pick an oracle feed by SYMBOL (ETH/USD, BTC/USD, USDC/USD), never an address.
- amounts are human-readable decimal strings.
- Emit nothing but the JSON object. No prose, no code, no markdown fences.`;

export const composeAgent = new Agent({
  id: "compose",
  name: "wave compose agent",
  instructions: COMPOSE_INSTRUCTIONS,
  model: gemmaModel(),
});

/**
 * Parse a natural-language intent into a bounded StrategySpec.
 * Throws on schema drift (errorStrategy: 'strict') — the compiler never sees a
 * malformed form. Caller wraps in try/catch → typed ParseError for the UI.
 */
export async function compose(nl: string): Promise<StrategySpec> {
  const res = await composeAgent.generate(nl, {
    structuredOutput: {
      schema: StrategySpec,
      jsonPromptInjection: "auto", // Gemma4-fast is non-OpenAI → prompt-injection, no 2nd LLM call
      errorStrategy: "strict", // schema drift must throw, not silently coerce
    },
    // temperature/maxOutputTokens live under modelSettings (Mastra generate),
    // NOT at the top level. Verified: reference-agents-generate.md L151-155.
    modelSettings: {
      temperature: 0, // form-filling, not creativity
      maxOutputTokens: 400, // the form is small; cap so a verbose model can't ramble
    },
  });
  if (!res.object) throw new Error("compose: model returned no structured object");
  // Mastra infers res.object from the schema's INPUT type, so maxStalenessSecs
  // (which uses .default(7200)) shows as optional here. zod applies the default
  // at parse → runtime always has it. Cast to the OUTPUT type is sound.
  return res.object as StrategySpec;
}
