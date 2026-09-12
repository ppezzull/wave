// Classify every Ledger / DMK / WebHID failure into an honest user-facing
// reason. Tags are stable across device-management-kit@1.9.0; message text
// is not. Always inspect `_tag`, then status-word `errorCode` (also buried
// on `originalError`), then DOM / RxJS `name`.

export interface LedgerFailure {
  /** Device refuse / picker dismiss — amber, not red. */
  kind: 'rejected' | 'error'
  reason: string
  debug: string
  /** Dead transport/session — next click must rediscover. */
  clearSession: boolean
}

type Loose = {
  _tag?: string
  name?: string
  message?: string
  errorCode?: string
  originalError?: Loose
  err?: unknown
}

const DISCONNECT_TAGS = new Set([
  'DeviceDisconnectedWhileSendingError',
  'DeviceDisconnectedBeforeSendingApdu',
  'DisconnectError',
  'DeviceSessionNotFound',
  'ReconnectionFailedError',
  'DeviceSessionRefresherError',
  'OpeningConnectionError',
  'SessionDead',
])

const TIMEOUT_TAGS = new Set([
  'SendApduTimeoutError',
  'SendCommandTimeoutError',
  'DiscoveryTimeout',
  'SessionWaitTimeout',
  'ApprovalTimeout',
  'DeviceBusyTimeout',
  'TimeoutError',
])

const TAG_REASON: Record<string, { reason: string; kind?: 'rejected' | 'error' }> = {
  RefusedByUserDAError: {
    kind: 'rejected',
    reason: 'Cancelled on device — nothing was shipped.',
  },
  NoAccessibleDeviceError: {
    reason: 'No Ledger was selected. Click Confirm and pick the device in the browser prompt.',
  },
  TransportNotSupportedError: {
    reason: 'This browser cannot talk to a Ledger. Use Chrome on localhost or HTTPS.',
  },
  NoTransportsProvidedError: {
    reason: 'Ledger transport is not available in this browser. Use Chrome on localhost or HTTPS.',
  },
  NoTransportProvidedError: {
    reason: 'Ledger transport is not available in this browser. Use Chrome on localhost or HTTPS.',
  },
  DeviceDisconnectedWhileSendingError: {
    reason: 'The Ledger was disconnected. Plug it back in, unlock it, then click Confirm.',
  },
  DeviceDisconnectedBeforeSendingApdu: {
    reason: 'The Ledger was disconnected. Plug it back in, unlock it, then click Confirm.',
  },
  DisconnectError: {
    reason: 'The Ledger was disconnected. Plug it back in, unlock it, then click Confirm.',
  },
  DeviceSessionNotFound: {
    reason: 'The Ledger session expired. Plug the device in, then click Confirm to reconnect.',
  },
  ReconnectionFailedError: {
    reason: 'Could not reconnect to the Ledger. Unplug it, plug it back in, then click Confirm.',
  },
  DeviceSessionRefresherError: {
    reason: 'Lost the Ledger session. Plug the device in, then click Confirm to reconnect.',
  },
  OpeningConnectionError: {
    reason: 'Could not open the Ledger connection. Unlock it and click Confirm again.',
  },
  SessionDead: {
    reason: 'The Ledger was disconnected. Plug it back in, then click Confirm.',
  },
  SendApduTimeoutError: {
    reason: 'The Ledger stopped responding. Check the cable, unlock the device, then click Confirm.',
  },
  SendCommandTimeoutError: {
    reason: 'The Ledger stopped responding. Check the cable, unlock the device, then click Confirm.',
  },
  DiscoveryTimeout: {
    reason: 'No Ledger found. Unlock it, leave it plugged in, then click Confirm and select it.',
  },
  SessionWaitTimeout: {
    reason: 'The Ledger did not come online. Unlock it (PIN), then click Confirm again.',
  },
  ApprovalTimeout: {
    reason: 'The Ledger did not confirm in time. When the device asks, press to sign — then click Confirm again.',
  },
  DeviceBusyTimeout: {
    reason: 'The Ledger is busy with another request. Close Ledger Live if it is open, then try again.',
  },
  TimeoutError: {
    reason: 'The Ledger timed out. Unlock it, keep it plugged in, then click Confirm again.',
  },
  DeviceLockedError: {
    reason: 'The Ledger is locked. Enter your PIN on the device, then click Confirm.',
  },
  DeviceNotOnboardedError: {
    reason: 'This Ledger is not set up yet. Finish onboarding in Ledger Live, then try again.',
  },
  DeviceNotInitializedError: {
    reason: 'This Ledger is not initialized. Finish setup in Ledger Live, then try again.',
  },
  DeviceNotRecognizedError: {
    reason: 'That USB device was not recognized as a Ledger. Unplug it and plug the Ledger back in.',
  },
  UnknownDeviceError: {
    reason: 'The selected device is not a Ledger we can use. Pick the Nano in the browser prompt.',
  },
  DeviceAlreadyDiscoveredError: {
    reason: 'The Ledger is already connected in another tab. Close the other tab and try again.',
  },
  AlreadySendingApduError: {
    reason: 'The Ledger is busy with another request. Wait a moment, then click Confirm again.',
  },
  SendApduConcurrencyError: {
    reason: 'The Ledger is busy with another request. Wait a moment, then click Confirm again.',
  },
  SendApduEmptyResponseError: {
    reason: 'Lost communication with the Ledger. Unplug it, plug it back in, then click Confirm.',
  },
  FramerOverflowError: {
    reason: 'Lost communication with the Ledger. Unplug it, plug it back in, then click Confirm.',
  },
  FramerApduError: {
    reason: 'Lost communication with the Ledger. Unplug it, plug it back in, then click Confirm.',
  },
  ReceiverApduError: {
    reason: 'Lost communication with the Ledger. Unplug it, plug it back in, then click Confirm.',
  },
  UnknownDeviceExchangeError: {
    reason:
      'The Ledger refused the message exchange. Enable blind signing in the Ethereum app settings, update the app via Ledger Live, then click Confirm.',
  },
  InvalidStatusWordError: {
    reason:
      'The Ledger returned an unexpected status — often an empty reply while signing. Enable blind signing in the Ethereum app settings, update the app, then click Confirm.',
  },
  InvalidResponseFormatError: {
    reason: 'The Ledger returned a malformed reply. Disconnect it, reconnect, then click Confirm.',
  },
  UnsupportedFirmwareDAError: {
    reason: 'This Ledger firmware is too old. Update it in Ledger Live, then try again.',
  },
  UnsupportedApplicationDAError: {
    reason: 'The Ethereum app on this Ledger is not supported. Update it in Ledger Live.',
  },
  OutOfMemoryDAError: {
    reason: 'The Ledger ran out of memory for this request. Close other apps on the device and retry.',
  },
  NetworkDAError: {
    reason: 'Ledger services could not be reached. Check your internet connection and try again.',
  },
  UnknownDAError: {
    reason: 'The Ledger rejected the request. Unlock it, open Ethereum, then click Confirm again.',
  },
}

const CODE_REASON: Record<string, string> = {
  '5501': 'Cancelled on device — nothing was shipped.',
  '6985': 'Cancelled on device — nothing was shipped.',
  '6982': 'Cancelled on device — nothing was shipped.',
  '5515': 'The Ledger is locked. Enter your PIN on the device, then click Confirm.',
  '6807': 'The Ethereum app is not installed. Install it via Ledger Live and try again.',
  '6980': 'The Ethereum app refused the message (status 6980). Enable blind signing in its settings and update the app via Ledger Live, then click Confirm.',
  '6a80': 'Blind signing is disabled. Enable it in the Ethereum app settings on the device.',
  '6e00': 'Wrong app is open. Confirm opening Ethereum on the device, then try again.',
  '6e01': 'The Ethereum app is not ready. Open it on the device, then click Confirm.',
}

function asLoose(err: unknown): Loose {
  return (err && typeof err === 'object' ? err : { message: String(err) }) as Loose
}

export function debugOf(err: unknown): string {
  if (err == null) return String(err)
  if (typeof err !== 'object') return String(err)
  const e = asLoose(err)
  const parts = [e._tag, e.name, e.errorCode, typeof e.message === 'string' ? e.message : undefined]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
  if (e.originalError) parts.push(`orig:${debugOf(e.originalError)}`)
  if (e.err != null && e.err !== err) parts.push(`err:${debugOf(e.err)}`)
  if (parts.length) return parts.join(' | ')
  try {
    return JSON.stringify(err)
  } catch {
    return Object.prototype.toString.call(err)
  }
}

function walk(err: unknown): { tag: string; code: string; name: string; message: string } {
  const e = asLoose(err)
  const orig = e.originalError
  const nested = e.err
  return {
    tag: String(e._tag ?? orig?._tag ?? (nested && typeof nested === 'object' ? (nested as Loose)._tag : '') ?? ''),
    code: String(
      e.errorCode ?? orig?.errorCode ?? (nested && typeof nested === 'object' ? (nested as Loose).errorCode : '') ?? '',
    ).toLowerCase(),
    name: String(e.name ?? orig?.name ?? ''),
    message: String(e.message ?? orig?.message ?? ''),
  }
}

export function isDeviceRejection(err: unknown): boolean {
  const { tag, code } = walk(err)
  return tag === 'RefusedByUserDAError' || code === '5501' || code === '6985' || code === '6982'
}

export function classifyLedgerFailure(err: unknown): LedgerFailure {
  const debug = debugOf(err)
  const { tag, code, name, message } = walk(err)
  const blob = `${tag} ${code} ${name} ${message} ${debug}`.toLowerCase()

  if (isDeviceRejection(err) || tag === 'RefusedByUserDAError') {
    return {
      kind: 'rejected',
      reason: 'Cancelled on device — nothing was shipped.',
      debug,
      clearSession: false,
    }
  }

  const fromCode = CODE_REASON[code]
  if (fromCode) {
    const rejected = code === '5501' || code === '6985' || code === '6982'
    return {
      kind: rejected ? 'rejected' : 'error',
      reason: fromCode,
      debug,
      clearSession: rejected ? false : DISCONNECT_TAGS.has(tag) || TIMEOUT_TAGS.has(tag),
    }
  }

  const fromTag = TAG_REASON[tag]
  if (fromTag) {
    return {
      kind: fromTag.kind ?? 'error',
      reason: fromTag.reason,
      debug,
      clearSession: DISCONNECT_TAGS.has(tag) || TIMEOUT_TAGS.has(tag),
    }
  }

  if (name === 'NotAllowedError' || /hid.*denied|permission/i.test(blob)) {
    return {
      kind: 'error',
      reason: 'Browser access to the Ledger was denied. Click Confirm and allow the device.',
      debug,
      clearSession: true,
    }
  }
  if (name === 'NotFoundError' || name === 'NoAccessibleDeviceError') {
    return {
      kind: 'error',
      reason: 'No Ledger was selected. Click Confirm and pick the device in the browser prompt.',
      debug,
      clearSession: true,
    }
  }
  if (name === 'SecurityError') {
    return {
      kind: 'error',
      reason: 'The browser blocked Ledger access. Use Chrome on localhost or HTTPS.',
      debug,
      clearSession: true,
    }
  }
  if (name === 'TimeoutError' || /timeout has occurred/i.test(message)) {
    return {
      kind: 'error',
      reason: TAG_REASON.TimeoutError.reason,
      debug,
      clearSession: true,
    }
  }
  if (/not installed/i.test(blob)) {
    return {
      kind: 'error',
      reason: CODE_REASON['6807'],
      debug,
      clearSession: false,
    }
  }
  if (/blind/i.test(blob)) {
    return {
      kind: 'error',
      reason: CODE_REASON['6a80'],
      debug,
      clearSession: false,
    }
  }
  if (/lock/i.test(blob)) {
    return {
      kind: 'error',
      reason: TAG_REASON.DeviceLockedError.reason,
      debug,
      clearSession: false,
    }
  }
  if (/disconnect|not connected|session.*not found|no device/i.test(blob)) {
    return {
      kind: 'error',
      reason: TAG_REASON.DeviceDisconnectedWhileSendingError.reason,
      debug,
      clearSession: true,
    }
  }
  if (/timeout|timed out/i.test(blob)) {
    return {
      kind: 'error',
      reason: TAG_REASON.TimeoutError.reason,
      debug,
      clearSession: true,
    }
  }
  if (/connection|webhid|hid/i.test(blob)) {
    return {
      kind: 'error',
      reason: 'Lost connection to the Ledger. Plug it back in, then click Confirm.',
      debug,
      clearSession: true,
    }
  }

  const hint = tag || name || 'unknown'
  return {
    kind: 'error',
    reason: `Unexpected Ledger error (${hint}). Unplug the device, plug it back in, then click Confirm.`,
    debug,
    clearSession: true,
  }
}
