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
import { useCallback, useRef, useState } from 'react'

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

type Frame = { type: string; object?: StrategySpec; payload?: { text?: string; error?: string } }

function tryParseJson(line: string): Frame | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith('{')) return null
  try {
    return JSON.parse(trimmed) as Frame
  } catch {
    return null
  }
}

export function useComposeStream() {
  const [state, setState] = useState<ComposeStreamState>({
    partial: null,
    spec: null,
    progress: '',
    error: null,
    isStreaming: false,
  })
  // The last `object` chunk — promoted to `spec` on finish (Mastra emits
  // successive objects; the final one is the validated StrategySpec).
  const lastObject = useRef<StrategySpec | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const compose = useCallback(async (intent: string, scope?: { resource: string; thread: string }) => {
    // Reset for a fresh turn.
    lastObject.current = null
    setState({
      partial: null,
      spec: null,
      progress: '',
      error: null,
      isStreaming: true,
    })

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
      if (ctrl.signal.aborted) return
      setState((s) => ({ ...s, isStreaming: false, error: String(err) }))
      return
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '')
      setState((s) => ({
        ...s,
        isStreaming: false,
        error: detail || `compile failed (HTTP ${response.status})`,
      }))
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let terminal = false

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

          switch (frame.type) {
            case 'object':
              if (frame.object && typeof frame.object === 'object') {
                lastObject.current = frame.object
                setState((s) => ({ ...s, partial: frame.object! }))
              }
              break
            case 'text-delta':
              if (frame.payload?.text) {
                setState((s) => ({ ...s, progress: s.progress + frame.payload!.text }))
              }
              break
            case 'error':
              setState((s) => ({ ...s, error: frame.payload?.error ?? 'agent error', isStreaming: false }))
              terminal = true
              break
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
      setState((s) => ({
        ...s,
        isStreaming: false,
        spec: s.error ? null : lastObject.current,
      }))
    } catch (err) {
      if (ctrl.signal.aborted) return
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
