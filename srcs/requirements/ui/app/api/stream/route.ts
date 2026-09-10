// GET /api/stream — SSE seam for compose/retune/HITL events (frontend.md L31).
//
// Transparent pipe to the agent's retune/HITL stream (task #31: the Mastra
// apiRoute in srcs/requirements/agent/src/mastra/routes/retune-stream.ts). If
// the agent is unreachable, fall through to a keep-alive empty SSE — never
// fabricate retune events (never-fabricate / Pietro G2).
//
// Browser hook: EventSource('/api/stream') (GET, so EventSource works here
// unlike POST /api/compile).
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AGENT_URL = process.env.AGENT_URL ?? 'http://agent:3002'
// Mastra mounts custom apiRoutes at route.path VERBATIM — /api is reserved for
// its built-in routes — so the agent serves this at /stream/retune, no prefix.
const AGENT_STREAM_PATH =
  process.env.AGENT_STREAM_PATH ?? '/stream/retune'

export async function GET(_req: NextRequest) {
  // Try the live agent stream. If unreachable / not implemented, fall through
  // to a keep-alive empty SSE so the UI seam exists without fabricated events.
  //
  // ⚠️ CONNECT-ONLY timeout: AbortSignal.timeout() aborts the BODY too, which
  // would kill every proxied stream 1.5s in. Abort manually and clear the timer
  // once response headers arrive — after that the stream lives until either
  // side closes it.
  const connect = new AbortController()
  const connectTimer = setTimeout(() => connect.abort(), 1500)
  try {
    const upstream = await fetch(`${AGENT_URL}${AGENT_STREAM_PATH}`, {
      method: 'GET',
      headers: { accept: 'text/event-stream' },
      signal: connect.signal,
    })
    if (upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        status: 200,
        headers: {
          'content-type':
            upstream.headers.get('content-type') ?? 'text/event-stream',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        },
      })
    }
  } catch {
    // Agent down or stream not shipped — empty keep-alive below.
  } finally {
    clearTimeout(connectTimer)
  }

  const encoder = new TextEncoder()
  let tick: ReturnType<typeof setInterval> | undefined
  let stop: ReturnType<typeof setTimeout> | undefined

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(': wave stream idle — waiting for retune source\n\n'),
      )
      tick = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          if (tick) clearInterval(tick)
        }
      }, 15000)
      stop = setTimeout(() => {
        if (tick) clearInterval(tick)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }, 5 * 60 * 1000)
    },
    cancel() {
      if (tick) clearInterval(tick)
      if (stop) clearTimeout(stop)
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
