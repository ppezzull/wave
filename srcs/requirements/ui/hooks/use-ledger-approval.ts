'use client'

// useLedgerApproval — the device half of the HITL gate.
//
// requestApproval() MUST be called from inside a click handler (WebHID's
// browser picker requires a user gesture). Dead sessions are dropped before
// rediscovery — unplug/replug must never reuse a stale sessionId.
import { useCallback, useRef, useState } from 'react'
import { firstValueFrom, filter, take, throwError, timeout as rxTimeout } from 'rxjs'
import { recoverMessageAddress } from 'viem'
import { useDmkLoader } from '@/components/ledger/ledger-provider'
import { classifyLedgerFailure } from '@/lib/ledger-errors'
import { ledgerLog, ledgerLogError, summarizeSession } from '@/lib/ledger-log'
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
  reason?: string
  debug?: string
}

const DERIVATION = "44'/60'/0'/0/0"

function tagged(tag: string, message: string) {
  return Object.assign(new Error(message), { _tag: tag })
}

export function useLedgerApproval() {
  const loadDmk = useDmkLoader()
  const [phase, setPhase] = useState<LedgerPhase>('idle')
  const [reason, setReason] = useState<string>()
  const [debug, setDebug] = useState<string>()
  const sessionIdRef = useRef<string>()

  const dropSession = useCallback(async (dmk?: { disconnect: (a: { sessionId: string }) => Promise<void> }) => {
    const id = sessionIdRef.current
    sessionIdRef.current = undefined
    if (id) ledgerLog('session.drop', { sessionId: id })
    if (id && dmk) {
      try {
        await dmk.disconnect({ sessionId: id })
      } catch {
        // already gone
      }
    }
  }, [])

  const fail = useCallback(
    async (
      err: unknown,
      dmk?: { disconnect: (a: { sessionId: string }) => Promise<void> },
    ): Promise<LedgerApprovalResult> => {
      const classified = classifyLedgerFailure(err)
      ledgerLogError('fail', err, {
        kind: classified.kind,
        reason: classified.reason,
        debug: classified.debug,
        clearSession: classified.clearSession,
        sessionId: sessionIdRef.current,
      })
      if (classified.clearSession) await dropSession(dmk)
      setDebug(classified.debug)
      if (classified.kind === 'rejected') {
        setPhase('rejected')
        setReason(classified.reason)
        return { status: 'rejected', reason: classified.reason, debug: classified.debug }
      }
      setPhase('error')
      setReason(classified.reason)
      return { status: 'error', reason: classified.reason, debug: classified.debug }
    },
    [dropSession],
  )

  /** Derive the device's ETH address (no device tap — checkOnDevice: false). */
  const getDeviceAddress = useCallback(async (): Promise<string> => {
    const dmk = await loadDmk()
    if (!sessionIdRef.current) throw tagged('SessionDead', 'connect the Ledger first')
    ledgerLog('getAddress.start', { sessionId: sessionIdRef.current })
    const { SignerEthBuilder } = await import('@ledgerhq/device-signer-kit-ethereum')
    const signer = new SignerEthBuilder({ dmk, sessionId: sessionIdRef.current }).build()
    const { observable } = signer.getAddress(DERIVATION, { checkOnDevice: false })
    const state = await firstValueFrom(
      observable.pipe(filter((s) => s.status === 'completed' || s.status === 'error'), take(1)),
    )
    if (state.status === 'error') {
      ledgerLogError('getAddress.error', state.error)
      throw state.error
    }
    ledgerLog('getAddress.ok', { address: state.output.address })
    return state.output.address
  }, [loadDmk])

  const requestApproval = useCallback(
    async (input: { message: string; expectedAddress?: string }): Promise<LedgerApprovalResult> => {
      setPhase('connecting')
      setReason(undefined)
      setDebug(undefined)
      ledgerLog('approval.start', {
        expected: input.expectedAddress,
        messageChars: input.message.length,
        messageHead: input.message.slice(0, 72),
        hadSession: !!sessionIdRef.current,
      })
      // The desync that fork-broke the device: the kit frames with string
      // length but encodes UTF-8 — log both so any mismatch is visible.
      {
        const bytes = new TextEncoder().encode(input.message).length
        ledgerLog('approval.message', {
          bytes,
          chars: input.message.length,
          bytesMatchChars: bytes === input.message.length,
          asciiOnly: /^[\x00-\x7f]*$/.test(input.message),
          full: input.message,
        })
      }
      let dmk: Awaited<ReturnType<typeof loadDmk>> | undefined
      try {
        const loaded = await Promise.all([loadDmk(), import('@ledgerhq/device-management-kit')])
        dmk = loaded[0]
        const { DeviceStatus, DeviceActionStatus, UserInteractionRequired } = loaded[1]
        ledgerLog('approval.dmk', { ok: !!dmk })

        // Drop a stale session (unplug, refresh, another tab). Skill: never
        // reuse Disconnected — restart discovery from the user gesture.
        if (sessionIdRef.current) {
          try {
            const existing = await firstValueFrom(
              dmk.getDeviceSessionState({ sessionId: sessionIdRef.current }).pipe(take(1), rxTimeout(3_000)),
            )
            ledgerLog('session.probe', { sessionId: sessionIdRef.current, ...summarizeSession(existing) })
            if (existing.deviceStatus === DeviceStatus.NOT_CONNECTED) {
              ledgerLog('session.stale', { why: 'NOT_CONNECTED' })
              await dropSession(dmk)
            }
          } catch (probeErr) {
            ledgerLogError('session.probe-fail', probeErr, { sessionId: sessionIdRef.current })
            await dropSession(dmk)
          }
        }

        if (!sessionIdRef.current) {
          ledgerLog('discover.start')
          const { webHidIdentifier } = await import('@ledgerhq/device-transport-kit-web-hid')
          const device = await firstValueFrom(
            dmk.startDiscovering({ transport: webHidIdentifier }).pipe(
              rxTimeout({
                first: 15_000,
                with: () => throwError(() => tagged('DiscoveryTimeout', 'No Ledger found')),
              }),
            ),
          )
          ledgerLog('discover.hit', {
            id: (device as { id?: string }).id,
            name: (device as { name?: string }).name,
            model: (device as { model?: string }).model,
          })
          sessionIdRef.current = await dmk.connect({
            device,
            sessionRefresherOptions: { isRefresherDisabled: false },
          })
          ledgerLog('connect.ok', { sessionId: sessionIdRef.current })
        }

        let state = await firstValueFrom(
          dmk.getDeviceSessionState({ sessionId: sessionIdRef.current }).pipe(
            filter((s) => s.deviceStatus !== DeviceStatus.NOT_CONNECTED),
            take(1),
            rxTimeout({
              first: 30_000,
              with: () => throwError(() => tagged('SessionWaitTimeout', 'Ledger did not come online')),
            }),
          ),
        )
        ledgerLog('session.state', {
          ...summarizeSession(state),
          stateKeys: Object.keys(state ?? {}),
          currentAppRaw: (state as { currentApp?: unknown })?.currentApp,
        })

        if (state.deviceStatus === DeviceStatus.BUSY) {
          ledgerLog('session.busy-wait')
          state = await firstValueFrom(
            dmk.getDeviceSessionState({ sessionId: sessionIdRef.current }).pipe(
              filter((s) => s.deviceStatus !== DeviceStatus.BUSY),
              take(1),
              rxTimeout({
                first: 10_000,
                with: () => throwError(() => tagged('DeviceBusyTimeout', 'Device busy')),
              }),
            ),
          )
          ledgerLog('session.after-busy', summarizeSession(state))
        }
        if (state.deviceStatus === DeviceStatus.NOT_CONNECTED) {
          throw tagged('SessionDead', 'Ledger disconnected')
        }
        setPhase('ready-on-device')

        const { SignerEthBuilder } = await import('@ledgerhq/device-signer-kit-ethereum')
        const signer = new SignerEthBuilder({ dmk, sessionId: sessionIdRef.current }).build()
        ledgerLog('sign.start', { derivation: DERIVATION, messageChars: input.message.length })
        const { observable, cancel } = signer.signMessage(DERIVATION, input.message)

        const output = await new Promise<{ r: string; s: string; v: number }>((resolve, reject) => {
          const timer = setTimeout(() => {
            cancel()
            reject(tagged('ApprovalTimeout', 'Approval timed out on device'))
          }, 60_000)
          observable.subscribe({
            next: (s) => {
              const interaction = s.intermediateValue?.requiredUserInteraction
              ledgerLog('sign.event', {
                status: s.status,
                interaction,
              })
              try {
                if (s.status === DeviceActionStatus.Completed) {
                  clearTimeout(timer)
                  resolve(s.output)
                } else if (s.status === DeviceActionStatus.Error) {
                  clearTimeout(timer)
                  reject(s.error)
                } else if (s.status === DeviceActionStatus.Stopped) {
                  clearTimeout(timer)
                  reject(tagged('ApprovalTimeout', 'Approval stopped on device'))
                } else if (s.status === DeviceActionStatus.Pending) {
                  const i = s.intermediateValue?.requiredUserInteraction
                  if (i === UserInteractionRequired.ConfirmOpenApp) setPhase('app-opening')
                  else if (i === UserInteractionRequired.SignPersonalMessage) setPhase('sign-on-device')
                  else if (i === UserInteractionRequired.UnlockDevice) setPhase('ready-on-device')
                }
              } catch (e) {
                clearTimeout(timer)
                reject(e)
              }
            },
            error: (e) => {
              clearTimeout(timer)
              reject(e)
            },
          })
        })

        const signature = toEip191Signature(output)
        const recovered = await recoverMessageAddress({ message: input.message, signature })
        ledgerLog('sign.ok', { recovered, sigBytes: (signature.length - 2) / 2, v: output.v })
        if (input.expectedAddress && recovered.toLowerCase() !== input.expectedAddress.toLowerCase()) {
          setPhase('error')
          const wrong = 'Wrong Ledger — this device is not the designated approver.'
          const detail = `recovered ${recovered}, expected ${input.expectedAddress}`
          setReason(wrong)
          setDebug(detail)
          ledgerLog('sign.wrong-device', { recovered, expected: input.expectedAddress })
          return {
            status: 'error',
            reason: wrong,
            debug: detail,
          }
        }
        setPhase('approved')
        return { status: 'approved', address: recovered, signature }
      } catch (err) {
        return fail(err, dmk)
      }
    },
    [dropSession, fail, loadDmk],
  )

  const reset = useCallback(() => {
    setPhase('idle')
    setReason(undefined)
    setDebug(undefined)
  }, [])

  return { phase, reason, debug, requestApproval, getDeviceAddress, reset }
}
