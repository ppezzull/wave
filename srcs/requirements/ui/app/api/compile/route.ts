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
// structuredOutput schema in defaultOptions / generateOptions (compose.agent.ts),
// so the agent returns the bounded StrategySpec regardless. Echoing a
// client-supplied schema would let the browser override the safety bound —
// the opposite of what we want.
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
const LOG = '[wave:compose]'

interface CompileBody {
  intent?: unknown
  scope?: { resource?: unknown; thread?: unknown }
}

function intentPreview(intent: string): string {
  const oneLine = intent.replace(/\s+/g, ' ').trim()
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}…` : oneLine
}

function hasHexAddress(intent: string): boolean {
  return /0x[a-fA-F0-9]{40}/.test(intent)
}

function addressesIn(intent: string): string[] {
  return intent.match(/0x[a-fA-F0-9]{40}/g) ?? []
}

/** Tee the upstream SSE: forward bytes unchanged, log a compact chunk summary. */
function teeSseWithLogs(upstream: ReadableStream<Uint8Array>, t0: number): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  let buffer = ''
  const counts: Record<string, number> = {}
  let lastObject: unknown = null
  let sawObjectResult = false
  let lastError: unknown = null

  const bump = (type: string) => {
    counts[type] = (counts[type] ?? 0) + 1
  }

  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk)
        buffer += decoder.decode(chunk, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const rawLine = buffer.slice(0, nl)
          buffer = buffer.slice(nl + 1)
          const line = rawLine.startsWith('data:')
            ? rawLine.slice(5).trimStart()
            : rawLine.trim()
          if (!line || line === '[DONE]') continue
          try {
            const frame = JSON.parse(line) as {
              type?: string
              object?: unknown
              payload?: { error?: unknown; text?: string }
            }
            const type = typeof frame.type === 'string' ? frame.type : 'unknown'
            bump(type)
            if (type === 'object' || type === 'object-result') {
              if (frame.object) lastObject = frame.object
              if (type === 'object-result') sawObjectResult = true
            }
            if (type === 'error') {
              lastError = frame.payload?.error ?? frame.payload ?? frame
              const msg =
                lastError &&
                typeof lastError === 'object' &&
                'message' in (lastError as object) &&
                typeof (lastError as { message: unknown }).message === 'string'
                  ? (lastError as { message: string }).message
                  : String(lastError)
              // Plain string — Next overlay serializes console.error(obj) as `{}`.
              console.warn(`${LOG} sse error chunk: ${msg}`)
            }
          } catch {
            // non-JSON SSE line — ignore for counters
          }
        }
      },
      flush() {
        const ms = Date.now() - t0
        const spec = lastObject as {
          pair?: { token0?: string; token1?: string }
          size?: { amount0?: string; amount1?: string }
          blocks?: Array<{ type?: string }>
        } | null
        console.info(LOG, 'proxy stream done', {
          ms,
          counts,
          objectChunks: counts.object ?? 0,
          objectResult: sawObjectResult,
          pair: spec?.pair ?? null,
          size: spec?.size ?? null,
          blocks: spec?.blocks?.map((b) => b.type) ?? [],
          error: lastError,
        })
      },
    }),
  )
}

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  let body: CompileBody
  try {
    body = (await req.json()) as CompileBody
  } catch {
    console.warn(LOG, 'invalid JSON body')
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
    console.warn(LOG, 'missing intent')
    return new Response(JSON.stringify({ error: 'missing "intent" string' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  // The compiler contract requires an explicit two-token pair. Do not send a
  // symbol-only or unsupported strategy to the LLM: it will otherwise try to
  // invent placeholder addresses and the resulting Zod failure is opaque.
  const addresses = addressesIn(intent)
  if (addresses.length < 2) {
    const error =
      'This composer creates two-token SwapVM liquidity strategies. Include token0 and token1 as 0x addresses plus both liquidity amounts. Scheduled DCA, moving-average triggers, and drawdown rules are not supported strategy blocks yet.'
    console.warn(LOG, 'intent rejected before agent', {
      reason: 'missing pair addresses',
      addressCount: addresses.length,
      preview: intentPreview(intent),
    })
    return new Response(JSON.stringify({ error }), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    })
  }

  const upstreamUrl = `${AGENT_URL}/api/agents/composeAgent/stream`
  console.info(LOG, 'proxy → agent', {
    agentUrl: AGENT_URL,
    upstreamUrl,
    intentChars: intent.length,
    has0xAddress: hasHexAddress(intent),
    preview: intentPreview(intent),
    scope: body.scope ?? null,
  })
  if (!hasHexAddress(intent)) {
    console.warn(
      LOG,
      'intent has no 0x…40-hex address — pair.token0/token1 will stay empty by agent rules',
    )
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
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(forwardBody),
      // The agent enforces its own compose() deadline (AbortSignal.timeout);
      // don't double-bound it here. Let the stream run.
    })
  } catch (err) {
    console.error(LOG, 'agent unreachable', { agentUrl: AGENT_URL, detail: String(err) })
    return new Response(
      JSON.stringify({ error: 'agent unreachable', detail: String(err) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }

  console.info(LOG, 'agent HTTP', {
    status: upstream.status,
    contentType: upstream.headers.get('content-type'),
    ms: Date.now() - t0,
  })

  if (!upstream.ok || !upstream.body) {
    // Surface the agent's error verbatim so the hook can show it.
    const text = await upstream.text().catch(() => '')
    console.error(LOG, 'agent non-OK', {
      status: upstream.status,
      bodyPreview: text.slice(0, 400),
    })
    return new Response(
      text || JSON.stringify({ error: `agent HTTP ${upstream.status}` }),
      { status: upstream.status, headers: { 'content-type': 'application/json' } },
    )
  }

  // Transparent pipe + debug counters (bytes unchanged for the browser).
  return new Response(teeSseWithLogs(upstream.body, t0), {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
