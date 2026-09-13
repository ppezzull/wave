// GET /api/stream/retune — the SSE feed the UI's /api/stream proxies (task #31).
//
// Every tick polls the subgraph ONCE, runs policy.decide() per strategy (monitorTick),
// and emits the non-noop actions as SSE `message` frames — the UI turns them into toasts
// (retune) or HITL approvals (hitl). The monitor loop stays the same one the workflow uses;
// this route is a read-side TAP on it, never a second decider with different inputs.
//
// DEDUP IS MANDATORY, not an optimization: poll() returns a SNAPSHOT of every strategy,
// not a diff. Without dedup each connected tab would re-toast the same R1 verdict every
// tick forever. Key = `${strategyId}:${trigger ?? type}:${entityId}` — a NEW swap entity
// on the same strategy re-fires (that's a real new cause), the same entity never re-fires.
// EventSource auto-reconnect resets per-connection dedup (seen is per-stream): one
// re-emitted event per reconnect is accepted SSE semantics.
//
// SSE framing: unnamed `data:` frames (the UI listens on `onmessage` only) + `:` comment
// lines for connect/keepalive (never surface as events).
import type { ApiRoute, ContextWithMastra } from "@mastra/core/server";
import { monitorTick, subgraphDeltaSource, type DeltaSource, type StrategyDelta } from "../../monitor/graphDelta.js";
import type { PolicyAction } from "../../policy/index.js";

/** What the UI consumes. Shapes pinned to the existing /api/stream listener (toasts + HITL). */
export type StreamEvent =
  | { type: "retune"; message: string; entityId?: string }
  | { type: "hitl"; action: string; message: string; strategyId?: string };

/** Pure: PolicyAction (+ the delta it decided on) → UI event. noop → null (nothing to send). */
export function actionToEvent(action: PolicyAction, delta: StrategyDelta): StreamEvent | null {
  switch (action.type) {
    case "noop":
      return null;
    case "askHuman":
      // HITL — the UI renders an approval card. `action` names the approval kind; the
      // message cites the trigger so the human sees WHY (E1/E2/E3 are escalation triggers).
      return {
        type: "hitl",
        action: "retune-approval",
        message: action.trigger ? `${action.reason} (${action.trigger})` : action.reason,
        strategyId: delta.strategyId,
      };
    default:
      // retune / stop / remove — autonomous verdicts, surfaced as a toast.
      return { type: "retune", message: `${action.type} — ${action.reason}`, entityId: delta.entityId };
  }
}

/**
 * Dedup one tick's actions against everything already streamed on this connection.
 * Index-aligned: monitorTick returns exactly one action per delta, in poll order. When
 * `seen` hits `cap` it CLEARS — a bounded sliding window, so a long-idle connection
 * eventually re-emits (and one dup per cap-window is accepted) rather than growing forever.
 * Returns only the events that survived (already mapped — noop never produces one).
 */
export function dedupTick(
  actions: PolicyAction[],
  deltas: StrategyDelta[],
  seen: Set<string>,
  cap = 200,
): StreamEvent[] {
  if (seen.size >= cap) seen.clear();
  const events: StreamEvent[] = [];
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const delta = deltas[i]!;
    const key = `${delta.strategyId}:${action.trigger ?? action.type}:${delta.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const event = actionToEvent(action, delta);
    if (event) events.push(event);
  }
  return events;
}

/**
 * ONE poll → decide → dedup. The memoized wrapper is the point: monitorTick decides on
 * EXACTLY the deltas we cite for dedup — a second poll() here would race the snapshot
 * (a swap landing between the two reads would cite an entity decide() never saw).
 */
export async function runTick(source: DeltaSource, seen: Set<string>): Promise<StreamEvent[]> {
  let polled: StrategyDelta[] | null = null;
  const memo: DeltaSource = {
    poll: async () => {
      if (polled === null) polled = await source.poll();
      return polled;
    },
  };
  const actions = await monitorTick(memo);
  return dedupTick(actions, polled ?? [], seen);
}

/**
 * The Hono route. Open (requiresAuth: false): the UI proxies it server-side, and the
 * events carry no secrets — verdicts + entity ids. The connection stays open across tick
 * failures: a subgraph blip must not kill the tab's feed, the next tick retries.
 *
 * ⚠️ SERVED AT http://<agent>/stream/retune — VERBATIM, no /api prefix. mastra@1.27.3's
 * server mounts apiRoutes at `route.path` as-is AND rejects paths starting with /api
 * ("reserved for built-in Mastra routes" — validateCustomRoutePaths throws at boot). The
 * docs' "auto-prefixed /api" holds for @mastra/hono adapters, not this one. The UI proxy
 * (ui/app/api/stream/route.ts) must use ${AGENT_URL}/stream/retune.
 */
export const retuneStreamRoute: ApiRoute = {
  path: "/stream/retune",
  method: "GET",
  requiresAuth: false,
  handler: (c: ContextWithMastra) => {
    const encoder = new TextEncoder();
    const seen = new Set<string>();
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (frame: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`${frame}\n\n`));
          } catch {
            cleanup(); // controller gone (client vanished mid-enqueue) — stop ticking
          }
        };
        const cleanup = () => {
          closed = true;
          if (timer !== undefined) clearInterval(timer);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        send(": connected");

        // Never overlap ticks: a slow poll + the interval firing again would double-poll
        // (two snapshots racing the memo) and double-send. The flag serializes them.
        let ticking = false;
        const tick = async () => {
          if (ticking || closed) return;
          ticking = true;
          try {
            // FRESH source per tick: subgraphDeltaSource captures `now` at factory time —
            // reusing one would freeze every tick's clock at connect time and skew the
            // staleness/liveness triggers (R3/S4/M1) the longer the tab stays open.
            const events = await runTick(subgraphDeltaSource(), seen);
            if (events.length === 0) {
              send(": keepalive"); // proves the feed is alive without spamming toasts
            } else {
              for (const event of events) send(`data: ${JSON.stringify(event)}`);
            }
          } catch (e) {
            console.warn("[stream/retune] tick failed — stream stays open:", (e as Error).message);
          } finally {
            ticking = false;
          }
        };

        timer = setInterval(() => void tick(), Number(process.env.STREAM_TICK_MS ?? 45_000));
        c.req.raw.signal.addEventListener("abort", cleanup);
        await tick(); // immediate first tick — no dead air before the first interval fires
      },
      cancel() {
        // Hono calls this when the client disconnects (the Response body is cancelled).
        closed = true;
        if (timer !== undefined) clearInterval(timer);
      },
    });

    return c.body(stream, 200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
  },
};
