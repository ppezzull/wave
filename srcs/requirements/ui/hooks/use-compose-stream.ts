'use client'

// useComposeStream — drive the create-drawer's "watch the AI fill the form" beat.
//
// POSTs the user's natural-language intent to /api/compile (which proxies the
// wave compose agent's Mastra stream), then reads the SSE response with a manual
// reader (EventSource is GET-only; /api/compile is POST). Parses each chunk per
// Mastra's ChunkType shapes (mastra.ai/reference/streaming/ChunkType):
//   - "object"     → progressive partial StrategySpec (top-level `object` field);
//                    each successive one is more complete. The last is validated.
//   - "text-delta" → reasoning prose (payload.text) — shown as "Compiling…".
//   - "error"      → failure (payload.error).
//   - "finish"     → terminal; the most-recent `object` chunk is the final spec.
//
// The parser tolerates BOTH standard SSE framing (`data: {...}\n\n`) and bare
// newline-delimited JSON, so it survives either transport Mastra may use.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface StrategySpec {
  specVersion?: number
  pair?: { token0?: string; token1?: string }
  size?: { amount0?: string; amount1?: string }
  blocks?: Array<{ type: string; [k: string]: unknown }>
  [k: string]: unknown
}

export interface ComposeStreamState {
  /** Most-recent partial StrategySpec (null until the first `object` chunk). */
  partial: StrategySpec | null
  /** Final validated StrategySpec (null until the stream completes cleanly). */
  spec: StrategySpec | null
  /** Latest reasoning/progress text for "Compiling…" affordances. */
  progress: string
  /** Error message if the stream failed; null otherwise. */
  error: string | null
  /** True while a stream is in flight. */
  isStreaming: boolean
}

const EMPTY_STATE: ComposeStreamState = {
  partial: null,
  spec: null,
  progress: '',
  error: null,
  isStreaming: false,
}

type Frame = {
  type: string
  object?: StrategySpec
  payload?: { text?: string; error?: unknown; [key: string]: unknown }
}

const LOG = '[wave:compose]'

function tryParseJson(line: string): Frame | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith('{')) return null
  try {
    return JSON.parse(trimmed) as Frame
  } catch {
    return null
  }
}

function summarizeSpec(spec: StrategySpec | null) {
  if (!spec) return null
  return {
    pair: spec.pair ?? null,
    size: spec.size ?? null,
    blocks: Array.isArray(spec.blocks) ? spec.blocks.map((b) => b.type) : [],
  }
}

function readStoredState(storageKey?: string): ComposeStreamState {
  if (!storageKey || typeof window === 'undefined') return EMPTY_STATE
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as Partial<ComposeStreamState> | null
    if (!value || typeof value !== 'object') return EMPTY_STATE
    return {
      partial: value.partial && typeof value.partial === 'object' ? value.partial : null,
      spec: value.spec && typeof value.spec === 'object' ? value.spec : null,
      progress: typeof value.progress === 'string' ? value.progress : '',
      error: typeof value.error === 'string' ? value.error : null,
      // A page reload aborts a fetch; never revive an orphaned stream as active.
      isStreaming: false,
    }
  } catch {
    return EMPTY_STATE
  }
}

/** Mastra error chunks put an object in payload.error — never feed that to React. */
function formatAgentError(err: unknown): string {
  if (err == null) return 'agent error'
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    const o = err as {
      message?: unknown
      code?: unknown
      details?: { value?: unknown }
      cause?: { message?: unknown }
    }
    const parts: string[] = []
    if (typeof o.message === 'string' && o.message.trim()) parts.push(o.message.trim())
    else if (typeof o.code === 'string') parts.push(o.code)
    if (typeof o.details?.value === 'string' && o.details.value.trim()) {
      parts.push(`got: ${o.details.value}`)
    }
    if (parts.length > 0) return parts.join('\n')
    try {
      return JSON.stringify(err)
    } catch {
      return 'agent error'
    }
  }
  return String(err)
}

function formatHttpError(body: string, status: number): string {
  if (!body) return `compile failed (HTTP ${status})`
  try {
    const value = JSON.parse(body) as { error?: unknown; detail?: unknown }
    if (typeof value.error === 'string') return value.error
    if (typeof value.detail === 'string') return value.detail
  } catch {
    // Non-JSON upstream response: return its text below.
  }
  return body
}

export function useComposeStream(storageKey?: string) {
  const [state, setState] = useState<ComposeStreamState>(() => readStoredState(storageKey))
  // The last `object` chunk — promoted to `spec` on finish (Mastra emits
  // successive objects; the final one is the validated StrategySpec).
  const lastObject = useRef<StrategySpec | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!storageKey || state.isStreaming) return
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ ...state, partial: state.spec ? state.partial : null }),
      )
    } catch {
      // Local storage may be unavailable (private mode/quota); compose still works.
    }
  }, [state, storageKey])

  const compose = useCallback(async (intent: string, scope?: { resource: string; thread: string }) => {
    // Reset for a fresh turn.
    lastObject.current = null
    const t0 = Date.now()
    const counts: Record<string, number> = {}
    const bump = (type: string) => {
      counts[type] = (counts[type] ?? 0) + 1
    }

    console.info(LOG, 'client start', {
      intentChars: intent.length,
      has0xAddress: /0x[a-fA-F0-9]{40}/.test(intent),
      scope: scope ?? null,
    })

    setState({ ...EMPTY_STATE, isStreaming: true })

    const ctrl = new AbortController()
    abortRef.current = ctrl

    let response: Response
    try {
      response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent, scope }),
        signal: ctrl.signal,
      })
    } catch (err) {
      if (ctrl.signal.aborted) {
        console.info(LOG, 'client aborted before response')
        return
      }
      console.warn(`${LOG} client fetch failed: ${String(err)}`)
      setState((s) => ({ ...s, isStreaming: false, error: String(err) }))
      return
    }

    console.info(LOG, 'client HTTP', { status: response.status, ms: Date.now() - t0 })

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '')
      const error = formatHttpError(detail, response.status)
      console.warn(
        `${LOG} client non-OK status=${response.status} body=${error.slice(0, 400)}`,
      )
      setState((s) => ({
        ...s,
        partial: null,
        spec: null,
        isStreaming: false,
        error,
      }))
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let terminal = false
    let streamError: string | null = null

    try {
      while (!terminal) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete lines. SSE separates events with a blank line; bare
        // NDJSON separates with \n. Splitting on \n handles both: a `data:`
        // prefix line is stripped below, a blank line is a no-op separator.
        let nl: number
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const rawLine = buffer.slice(0, nl)
          buffer = buffer.slice(nl + 1)
          const line = rawLine.startsWith('data:')
            ? rawLine.slice(5).trimStart()
            : rawLine
          if (!line) continue

          const frame = tryParseJson(line)
          if (!frame) continue
          bump(frame.type)

          switch (frame.type) {
            case 'object':
            case 'object-result':
              // Progressive partials are `object`; the final validated StrategySpec
              // is `object-result` (Mastra structuredOutput). Both carry top-level
              // `object` — promote either so the form fills even if only the final
              // chunk arrives.
              if (frame.object && typeof frame.object === 'object') {
                lastObject.current = frame.object
                if (frame.type === 'object-result' || (counts.object ?? 0) === 1) {
                  console.info(LOG, `client ${frame.type}`, summarizeSpec(frame.object))
                }
                setState((s) => ({ ...s, partial: frame.object! }))
              }
              break
            case 'text-delta':
              if (typeof frame.payload?.text === 'string') {
                setState((s) => ({ ...s, progress: s.progress + frame.payload!.text }))
              }
              break
            case 'error': {
              // payload.error is often a Mastra error object ({ message, code, … }),
              // not a string — stringify before state/React or the UI crashes.
              // Use warn + a single string: console.error(obj) makes Next's overlay
              // pop "Console Error" with a useless `{}` serialization.
              const raw = frame.payload?.error ?? frame.payload ?? frame
              streamError = formatAgentError(raw)
              console.warn(`${LOG} client sse error: ${streamError}`)
              setState((s) => ({
                ...s,
                partial: null,
                spec: null,
                error: streamError,
                isStreaming: false,
              }))
              terminal = true
              break
            }
            case 'finish':
              terminal = true
              break
            default:
              // Other chunk types (step-start, tool-call, etc.) are ignored —
              // the form-fill beat only needs object + text + finish.
              break
          }
        }
      }
      // Stream ended (finish or clean close). Promote the last object to spec.
      const finalSpec = streamError ? null : lastObject.current
      console.info(LOG, 'client done', {
        ms: Date.now() - t0,
        counts,
        objectChunks: counts.object ?? 0,
        objectResult: counts['object-result'] ?? 0,
        hasSpec: Boolean(finalSpec),
        spec: summarizeSpec(finalSpec),
        error: streamError,
      })
      if (!streamError && !finalSpec) {
        console.warn(
          LOG,
          'stream finished with no object/object-result — form will stay empty (structuredOutput missing or LLM derailed)',
        )
      }
      setState((s) => ({
        ...s,
        partial: streamError ? null : s.partial,
        isStreaming: false,
        spec: finalSpec,
      }))
    } catch (err) {
      if (ctrl.signal.aborted) {
        console.info(LOG, 'client aborted mid-stream')
        return
      }
      console.warn(`${LOG} client read failed: ${String(err)}`)
      setState((s) => ({ ...s, isStreaming: false, error: String(err) }))
    } finally {
      abortRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState((s) => ({ ...s, isStreaming: false }))
  }, [])

  return { ...state, compose, cancel }
}
