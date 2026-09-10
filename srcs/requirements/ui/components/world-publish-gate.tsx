'use client'

// World publish gate — the client half of Step 5 (ETHOnline World plan).
//
// useWorldPublishGate() wraps the ship flow: `const gate = await require(spec,
// description)`; when gate.ok, forward gate.proof to shipStrategy's worldProof.
// When the gate is enabled and no dev fixture is active, require() opens the
// IDKit widget (preset proofOfHuman, signal = digest of the exact payload
// being shipped); the ship server action re-derives the signal and consumes
// the nullifier — a proof unlocks only the strategy it was minted for, only
// once. Every ship mints a fresh proof (the signal binds the payload), so
// there is deliberately no held-proof reuse across ships.
//
// The decision carries the proof itself (not state) — the caller continues in
// the same closure that awaited, so no stale-react-state hazard.
//
// Mount `{gate.dialog}` once per screen using the gate.

import { useCallback, useEffect, useRef, useState } from 'react'
import { IDKitRequestWidget, proofOfHuman, type IDKitResult } from '@worldcoin/idkit'
import {
  createWorldRpContext,
  verifyWorldProof,
  worldPublishConfig,
} from '@/app/actions/world'
import type { WorldPublishConfig, WorldRpContext } from '@/lib/world/config'
import { publishSignal } from '@/lib/world/publish-signal'
import type { WorldProofPayload } from '@/lib/world/publish-signal'
import type { ShipStrategySpec } from '@/app/actions/ship'

export interface WorldGateDecision {
  ok: boolean
  /** Forward to shipStrategy (opts.worldProof) when ok — absent when the gate is off. */
  proof?: WorldProofPayload
  /** Why the gate refused, when !ok. */
  reason?: string
}

export interface WorldPublishGate {
  /** Await publishing permission; opens the widget when a proof is needed. */
  require: (spec: ShipStrategySpec, description: string) => Promise<WorldGateDecision>
  /** Mount once: the IDKit dialog (renders nothing until opened). */
  dialog: React.ReactNode
  config: WorldPublishConfig | null
}

export function useWorldPublishGate(): WorldPublishGate {
  const [config, setConfig] = useState<WorldPublishConfig | null>(null)
  const [open, setOpen] = useState(false)
  const [rpContext, setRpContext] = useState<WorldRpContext | null>(null)
  const [signal, setSignal] = useState<string | null>(null)
  const resolverRef = useRef<((d: WorldGateDecision) => void) | null>(null)

  useEffect(() => {
    let cancelled = false
    void worldPublishConfig().then((c) => {
      if (!cancelled) setConfig(c)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const settle = useCallback((d: WorldGateDecision) => {
    resolverRef.current?.(d)
    resolverRef.current = null
    setOpen(false)
  }, [])

  const require = useCallback(
    async (spec: ShipStrategySpec, description: string): Promise<WorldGateDecision> => {
      const cfg = await (config ?? worldPublishConfig())
      if (!cfg.gateOn) return { ok: true }
      if (cfg.devAllow) return { ok: true, proof: { kind: 'dev' } }
      const sig = await publishSignal(spec, description)
      const rp = await createWorldRpContext()
      if (!rp) {
        return { ok: false, reason: 'World verification unavailable (signing key not configured)' }
      }
      setSignal(sig)
      setRpContext(rp)
      setOpen(true)
      return new Promise<WorldGateDecision>((resolve) => {
        resolverRef.current = resolve
      })
    },
    [config],
  )

  const dialog = (
    <WorldVerifyDialog
      open={open}
      config={config}
      rpContext={rpContext}
      signal={signal}
      onVerified={(payload) => settle({ ok: true, proof: payload })}
      onCancelled={() => settle({ ok: false, reason: 'cancelled' })}
    />
  )

  return { require, dialog, config }
}

function WorldVerifyDialog({
  open,
  config,
  rpContext,
  signal,
  onVerified,
  onCancelled,
}: {
  open: boolean
  config: WorldPublishConfig | null
  rpContext: WorldRpContext | null
  signal: string | null
  onVerified: (payload: WorldProofPayload) => void
  onCancelled: () => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-label="Verify you are human to publish"
    >
      <div className="w-full max-w-md rounded-[14px] bg-wave-surface border border-wave-border p-5 flex flex-col gap-4">
        <div>
          <h2 className="font-sans font-bold text-[1.1rem] text-wave-text">
            Verified humans publish
          </h2>
          <p className="font-sans text-[13px] text-wave-muted mt-1">
            Publishing is wave&apos;s sybil surface — confirm you are a unique
            human with World ID. The proof binds to this exact strategy and
            cannot be reused for another one.
          </p>
        </div>

        {rpContext && signal && config?.appId ? (
          <IDKitRequestWidget
            open={open}
            onOpenChange={(o) => {
              if (!o) onCancelled()
            }}
            app_id={config.appId as `app_${string}`}
            action={config.action}
            rp_context={rpContext}
            allow_legacy_proofs={false}
            environment={config.idkitEnv}
            preset={proofOfHuman({ signal })}
            handleVerify={async (result) => {
              const v = await verifyWorldProof(result, signal)
              if (!v.ok) throw new Error(v.reason ?? 'proof verification failed')
            }}
            onSuccess={(result: IDKitResult) => {
              onVerified({ kind: 'idkit', result, signal })
            }}
          />
        ) : (
          <p className="font-sans text-[13px] text-wave-muted">Preparing verification…</p>
        )}

        <button
          type="button"
          onClick={onCancelled}
          className="self-start font-sans text-[13px] text-wave-muted underline underline-offset-4"
        >
          Cancel publishing
        </button>
      </div>
    </div>
  )
}
