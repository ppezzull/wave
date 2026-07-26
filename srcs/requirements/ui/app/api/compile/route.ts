// /api/compile — POST, SSE. A transparent byte-pipe to the wave compose agent.
//
// The browser POSTs a natural-language intent here; this route forwards it to
// the agent's Mastra stream endpoint and pipes the SSE response straight back,
// unchanged. The browser never sees AGENT_URL or the LLM key (frontend.md §8 —
// no business logic, no keys, on the client). The agent does the compile.
//
// Mastra auto-mounts `new Agent()` instances under /api/agents/<mapKey>/... —
// the compose agent is registered under key `composeAgent` (NOT the instance
// `id` "compose"; recall.smoke.ts:32 resolves it via getAgent("composeAgent")),
// so the stream route is /api/agents/composeAgent/stream (mastra-api skill +
// mastra.ai/reference/server/routes.md: POST /api/agents/:agentId/stream).
//
// Request body (this route):  { intent: string; scope?: { resource; thread } }
// Forwarded body (to Mastra): { messages: [{role:'user', content:intent}],
//                               output: <StrategySpec zod schema echo OFF>,
//                               memory?: scope }
// `output` is intentionally NOT echoed: composeAgent already applies the
// structuredOutput schema in generateOptions() (compose.agent.ts), so the agent
// returns the bounded StrategySpec regardless. Echoing a client-supplied schema
// would let the browser override the safety bound — the opposite of what we want.
//
// Response: the agent's SSE stream, piped through verbatim. Chunk shapes are
// Mastra's (mastra.ai/reference/streaming/ChunkType): successive `object` chunks
// carry partial→complete StrategySpec in a top-level `object` field (the
// "watch the AI fill the form" beat); `text-delta` carries reasoning prose;
// `error` carries failures. This route is format-agnostic — parsing lives in
// the browser hook (hooks/use-compose-stream.ts).
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AGENT_URL = process.env.AGENT_URL ?? 'http://agent:3002'

interface CompileBody {
  intent?: unknown
  scope?: { resource?: unknown; thread?: unknown }
}

export async function POST(req: NextRequest) {
  let body: CompileBody
  try {
    body = (await req.json()) as CompileBody
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  // Byte-for-byte: the description IS the prompt (Pietro.md). Do NOT trim,
  // reflow, or normalize — a mismatch with the ENS description record is a
  // compile failure, not polish. Empty-string only rejects missing input.
  const intent = typeof body.intent === 'string' ? body.intent : ''
  if (intent.length === 0) {
    return new Response(JSON.stringify({ error: 'missing "intent" string' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  // Compose the Mastra request. messages accepts a CoreMessage[] | string; we
  // send a single user turn. memory is optional recall scope (resource/thread).
  const forwardBody: Record<string, unknown> = {
    messages: [{ role: 'user', content: intent }],
  }
  if (
    body.scope &&
    typeof body.scope.resource === 'string' &&
    typeof body.scope.thread === 'string'
  ) {
    forwardBody.memory = { resource: body.scope.resource, thread: body.scope.thread }
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `${AGENT_URL}/api/agents/composeAgent/stream`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(forwardBody),
        // The agent enforces its own compose() deadline (AbortSignal.timeout);
        // don't double-bound it here. Let the stream run.
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'agent unreachable', detail: String(err) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }

  if (!upstream.ok || !upstream.body) {
    // Surface the agent's error verbatim so the hook can show it.
    const text = await upstream.text().catch(() => '')
    return new Response(
      text || JSON.stringify({ error: `agent HTTP ${upstream.status}` }),
      { status: upstream.status, headers: { 'content-type': 'application/json' } },
    )
  }

  // Transparent pipe: forward the SSE stream to the browser unchanged.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
