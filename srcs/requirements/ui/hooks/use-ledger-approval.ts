'use client'

// useLedgerApproval — the device half of the HITL gate.
//
// requestApproval() MUST be called from inside a click handler (WebHID's
// browser picker requires a user gesture). The walk follows the DMK skill:
// discover (15s) → connect → session Ready (locked → PIN hint) →
// signerEth.signMessage (auto-opens the Ethereum app; its interaction states
// drive the phases) → 60s timeout cancels. User rejection is a NEUTRAL
// outcome ("cancelled on device"), never a red error.
//
// Enum values verified at runtime against device-management-kit@1.9.0 /
// device-signer-kit-ethereum@1.18.0.
import { useCallback, useRef, useState } from 'react'
import { firstValueFrom, filter, take, timeout as rxTimeout } from 'rxjs'
import { recoverMessageAddress } from 'viem'
import { useDmkLoader } from '@/components/ledger/ledger-provider'
import { toEip191Signature } from '@/lib/ledger'

export type LedgerPhase =
  | 'idle'
  | 'connecting'
  | 'ready-on-device'
  | 'app-opening'
  | 'sign-on-device'
  | 'approved'
  | 'rejected'
  | 'error'

export interface LedgerApprovalResult {
  status: 'approved' | 'rejected' | 'error'
  address?: string
  signature?: string
  reason?: string // user-facing
  debug?: string // raw detail — never shown to users
}

const DERIVATION = "44'/60'/0'/0/0" // developer-set constant — never user input

/** User rejection: neutral, per the DMK skill's taxonomy. */
function isDeviceRejection(err: unknown): boolean {
  const e = err as { name?: string; _tag?: string; errorCode?: string; originalError?: { errorCode?: string } }
  const code = e?.errorCode ?? e?.originalError?.errorCode
  return (
    e?._tag === 'RefusedByUserDAError' ||
    e?.name === 'NoAccessibleDeviceError' || // picker closed by the user
    code === '5501' ||
    code === '6985' ||
    code === '6982'
  )
}

function classifyDeviceError(err: unknown): { reason: string; debug: string } {
  const e = err as { errorCode?: string; originalError?: { errorCode?: string }; message?: string }
  const code = e?.errorCode ?? e?.originalError?.errorCode
  const debug = String((err as Error)?.message ?? err)
  if (code === '5515' || /lock/i.test(debug)) {
    return { reason: 'The Ledger is locked. Enter your PIN on the device, then try again.', debug }
  }
  if (code === '6807' || /not installed/i.test(debug)) {
    return { reason: 'The Ethereum app is not installed. Install it via Ledger Live and try again.', debug }
  }
  if (code === '6a80' || /blind/i.test(debug)) {
    return { reason: 'Blind signing is disabled. Enable it in the Ethereum app settings on the device.', debug }
  }
  if (/disconnected|timeout|connection/i.test(debug)) {
    return { reason: 'Lost connection to the Ledger. Reconnect the device and try again.', debug }
  }
  return { reason: 'Unexpected Ledger error. Reconnect the device and start again.', debug }
}

export function useLedgerApproval() {
  const loadDmk = useDmkLoader()
  const [phase, setPhase] = useState<LedgerPhase>('idle')
  const [reason, setReason] = useState<string>()
  const sessionIdRef = useRef<string>()

  /** Derive the device's ETH address (no device tap — checkOnDevice: false). */
  const getDeviceAddress = useCallback(async (): Promise<string> => {
    const dmk = await loadDmk()
    if (!sessionIdRef.current) throw new Error('connect the Ledger first')
    const { SignerEthBuilder } = await import('@ledgerhq/device-signer-kit-ethereum')
    const signer = new SignerEthBuilder({ dmk, sessionId: sessionIdRef.current }).build()
    const { observable } = signer.getAddress(DERIVATION, { checkOnDevice: false })
    const state = await firstValueFrom(
      observable.pipe(filter((s) => s.status === 'completed' || s.status === 'error'), take(1)),
    )
    if (state.status === 'error') throw new Error(String(state.error))
    return state.output.address
  }, [loadDmk])

  const requestApproval = useCallback(
    async (input: { message: string; expectedAddress?: string }): Promise<LedgerApprovalResult> => {
      setPhase('connecting')
      setReason(undefined)
      try {
        const [dmk] = await Promise.all([
          loadDmk(),
          import('@ledgerhq/device-management-kit').then((m) => m),
        ])

        // (a) discover + connect — inside the gesture's activation window
        if (!sessionIdRef.current) {
          const { webHidIdentifier } = await import('@ledgerhq/device-transport-kit-web-hid')
          const device = await firstValueFrom(
            dmk.startDiscovering({ transport: webHidIdentifier }).pipe(rxTimeout(15_000)),
          )
          sessionIdRef.current = await dmk.connect({
            device,
            sessionRefresherOptions: { isRefresherDisabled: false },
          })
        }

        // (b) wait for a usable session state (locked stays until PIN entry)
        const { DeviceStatus } = await import('@ledgerhq/device-management-kit')
        const state = await firstValueFrom(
          dmk.getDeviceSessionState({ sessionId: sessionIdRef.current }).pipe(
            filter((s) => s.deviceStatus !== DeviceStatus.NOT_CONNECTED),
            take(1),
            rxTimeout(30_000),
          ),
        )
        if (state.deviceStatus === DeviceStatus.LOCKED) setPhase('ready-on-device')
        else setPhase('ready-on-device')

        // (c) sign — the signer auto-opens the Ethereum app; interactions drive phases
        const { SignerEthBuilder, DeviceActionStatus, UserInteractionRequired } =
          await import('@ledgerhq/device-signer-kit-ethereum')
        const signer = new SignerEthBuilder({ dmk, sessionId: sessionIdRef.current }).build()
        const { observable, cancel } = signer.signMessage(DERIVATION, input.message)

        const output = await new Promise<{ r: string; s: string; v: number }>((resolve, reject) => {
          const timer = setTimeout(() => {
            cancel()
            reject(Object.assign(new Error('Approval timed out on device'), { _tag: 'ApprovalTimeout' }))
          }, 60_000)
          observable.subscribe({
            next: (s) => {
              if (s.status === DeviceActionStatus.Completed) {
                clearTimeout(timer)
                resolve(s.output)
              } else if (s.status === DeviceActionStatus.Error) {
                clearTimeout(timer)
                reject(s.error)
              } else if (s.status === DeviceActionStatus.Pending) {
                const i = s.intermediateValue?.requiredUserInteraction
                if (i === UserInteractionRequired.ConfirmOpenApp) setPhase('app-opening')
                else if (i === UserInteractionRequired.SignPersonalMessage) setPhase('sign-on-device')
                else if (i === UserInteractionRequired.UnlockDevice) setPhase('ready-on-device')
              }
            },
            error: (e) => {
              clearTimeout(timer)
              reject(e)
            },
          })
        })

        // (d) assemble + self-verify BEFORE the round trip
        const signature = toEip191Signature(output)
        const recovered = await recoverMessageAddress({ message: input.message, signature })
        if (input.expectedAddress && recovered.toLowerCase() !== input.expectedAddress.toLowerCase()) {
          setPhase('error')
          return {
            status: 'error',
            reason: 'Wrong Ledger — this device is not the designated approver.',
            debug: `recovered ${recovered}, expected ${input.expectedAddress}`,
          }
        }
        setPhase('approved')
        return { status: 'approved', address: recovered, signature }
      } catch (err) {
        if (isDeviceRejection(err) || (err as { _tag?: string })?._tag === 'ApprovalTimeout') {
          setPhase('rejected')
          return { status: 'rejected' }
        }
        const { reason: r, debug } = classifyDeviceError(err)
        setPhase('error')
        setReason(r)
        return { status: 'error', reason: r, debug }
      }
    },
    [loadDmk],
  )

  const reset = useCallback(() => {
    setPhase('idle')
    setReason(undefined)
  }, [])

  return { phase, reason, requestApproval, getDeviceAddress, reset }
}
