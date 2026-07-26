'use client'

// useEventStream — subscribe to GET /api/stream (SSE).
// Carries retune notifications + HITL approval requests once Flavio's
// graphDelta emits real events. Until then the route is a keep-alive empty
// stream; this hook surfaces nothing fabricated.
import { useEffect, useState } from 'react'

export interface StreamRetune {
  type: 'retune'
  message: string
  entityId?: string
  txHash?: string
}

export interface StreamHitl {
  type: 'hitl'
  action: string
  message: string
  strategyId?: string
}

export type StreamEvent = StreamRetune | StreamHitl

export function useEventStream(enabled = true) {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return

    const es = new EventSource('/api/stream')
    es.onopen = () => {
      setConnected(true)
      setError(null)
    }
    es.onerror = () => {
      setConnected(false)
      setError('stream disconnected')
    }
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as StreamEvent
        if (parsed && (parsed.type === 'retune' || parsed.type === 'hitl')) {
          setEvents((prev) => [...prev, parsed])
        }
      } catch {
        // Keepalive comments / non-JSON frames — ignore.
      }
    }

    return () => {
      es.close()
      setConnected(false)
    }
  }, [enabled])

  return { events, connected, error }
}
