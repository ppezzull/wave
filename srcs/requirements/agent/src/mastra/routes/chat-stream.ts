// POST /stream/chat — the ONE chat endpoint: intent-routed, two lanes, one wire.
//
// The UI proxy (ui/app/api/compile/route.ts) forwards {intent, scope} here. This
// route classifies the lane (intent.ts), then streams EITHER lane's fullStream
// chunks VERBATIM as SSE — the browser hook (use-compose-stream.ts) parses Mastra
// ChunkType frames and never needs to know which lane ran:
//
//   strategy  → composeStream() — `object`/`object-result` partials fill the form
//               (the "watch the AI fill the form" beat), strict Zod bounds hold.
//   assistant → assistStream() — `text-delta` frames the hook accumulates as the
//               reply text.
//
// A `mode` frame goes out BEFORE any lane chunks so the UI can render the right
// affordance from the first token (live reply bubble vs. form card).
//
// The old 422 address gate from the UI proxy moved here (strategy lane only): a
// strategy request without both 0x addresses emits an in-stream `error` frame with
// the same guidance — the assistant lane must never be blocked by a compiler
// preflight, and the strategy lane still never reaches the LLM unpairable.
//
// ⚠️ SERVED AT http://<agent>/stream/chat — VERBATIM, no /api prefix (same rule as
// retune-stream.ts: Mastra's server mounts apiRoutes at route.path as-is and
// REJECTS paths starting with /api at boot).
import type { ApiRoute, ContextWithMastra } from "@mastra/core/server";
import { composeStream } from "../compose.agent.js";
import { assistStream } from "../assistant.agent.js";
import { resolveLane } from "../intent.js";

const LOG = "[wave:chat]";

interface ChatBody {
  intent?: unknown;
  scope?: { resource?: unknown; thread?: unknown };
}

/** The strategy-lane preflight (was the UI proxy's 422): the compiler contract
 *  needs an explicit two-token pair; without it the LLM invents placeholders and
 *  the Zod failure is opaque. Message kept byte-identical to the old 422 body. */
const PAIR_REQUIRED =
  "This composer creates two-token SwapVM liquidity strategies. Include token0 and token1 as 0x addresses plus both liquidity amounts. Scheduled DCA, moving-average triggers, and drawdown rules are not supported strategy blocks yet.";

export const chatStreamRoute: ApiRoute = {
  path: "/stream/chat",
  method: "POST",
  requiresAuth: false, // the UI proxies it server-side; frames carry no secrets
  handler: (c: ContextWithMastra) => {
    const encoder = new TextEncoder();

    // Shared by start() and cancel(): a client disconnect must stop the lane from both.
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (frame: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
          } catch {
            closed = true; // client vanished mid-enqueue — stop the lane
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        c.req.raw.signal.addEventListener("abort", close);

        // --- Parse (same body shape the UI already sends) ---
        let intent = "";
        let scope: { resource: string; thread: string } | undefined;
        try {
          const body = (await c.req.json()) as ChatBody;
          if (typeof body.intent === "string") intent = body.intent;
          if (
            body.scope &&
            typeof body.scope.resource === "string" &&
            typeof body.scope.thread === "string"
          ) {
            scope = { resource: body.scope.resource, thread: body.scope.thread };
          }
        } catch {
          send({ type: "error", payload: { error: "invalid JSON body" } });
          return close();
        }
        if (intent.length === 0) {
          send({ type: "error", payload: { error: 'missing "intent" string' } });
          return close();
        }

        // --- Classify the lane ---
        const t0 = Date.now();
        const { mode, how } = await resolveLane(intent);
        console.info(LOG, "lane", {
          mode,
          how,
          ms: Date.now() - t0,
          intentChars: intent.length,
          preview: intent.replace(/\s+/g, " ").trim().slice(0, 120),
          scope: scope ?? null,
        });
        send({ type: "mode", payload: { mode } });

        try {
          if (mode === "strategy") {
            const addresses = intent.match(/0x[a-fA-F0-9]{40}/g) ?? [];
            if (addresses.length < 2) {
              console.warn(LOG, "strategy lane rejected pre-agent", {
                addressCount: addresses.length,
              });
              send({ type: "error", payload: { error: PAIR_REQUIRED } });
              send({ type: "finish" });
              return close();
            }
            const composed = await composeStream(intent, scope);
            let sawFinish = false;
            for await (const chunk of composed.fullStream) {
              if (closed) break;
              if ((chunk as { type?: string }).type === "finish") sawFinish = true;
              send(chunk);
            }
            if (!sawFinish && !closed) send({ type: "finish" });
          } else {
            const assisted = await assistStream(intent, scope);
            let sawFinish = false;
            for await (const chunk of assisted.fullStream) {
              if (closed) break;
              if ((chunk as { type?: string }).type === "finish") sawFinish = true;
              send(chunk);
            }
            if (!sawFinish && !closed) send({ type: "finish" });
          }
        } catch (err) {
          console.error(LOG, "lane failed", { mode, err: String(err) });
          if (!closed) {
            send({ type: "error", payload: { error: String(err) } });
            send({ type: "finish" });
          }
        }
        close();
      },
      cancel() {
        // Hono calls this when the client disconnects (body cancelled).
        closed = true;
      },
    });

    return c.body(stream, 200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
  },
};
