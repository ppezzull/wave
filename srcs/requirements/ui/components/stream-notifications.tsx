'use client'

// Live retune / HITL toast strip — subscribes to GET /api/stream.
// Shows nothing fabricated; idle stream → no chrome. When Flavio's graphDelta
// emits real events, badges appear here (create-drawer + strategy detail).
import { useEventStream } from '@/hooks/use-event-stream'

export function StreamNotifications({ enabled = true }: { enabled?: boolean }) {
  const { events } = useEventStream(enabled)
  if (events.length === 0) return null

  const latest = events[events.length - 1]!
  return (
    <div
      className="rounded-[12px] px-4 py-3 mb-4 border"
      style={{
        background:
          latest.type === 'hitl' ? 'rgba(245,166,35,0.12)' : 'rgba(42,157,143,0.12)',
        borderColor: latest.type === 'hitl' ? '#F5A623' : '#2A9D8F',
      }}
      role="status"
      aria-live="polite"
    >
      <p className="font-sans text-[13px] font-semibold text-wave-text">
        {latest.type === 'retune' ? 'Retuned ✓' : 'Needs approval'}
      </p>
      <p className="font-sans text-[13px] text-wave-muted mt-0.5">{latest.message}</p>
      {latest.type === 'retune' && latest.txHash && (
        <p className="font-mono text-[12px] text-wave-muted mt-1">tx {latest.txHash}</p>
      )}
      {latest.type === 'retune' && latest.entityId && (
        <p className="font-mono text-[11px] text-wave-muted">entity {latest.entityId}</p>
      )}
    </div>
  )
}
