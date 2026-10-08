// Decides when the desktop app should try to win back a Car Thing that
// dropped off. Pure, so the timing rules can be tested; adb.ts runs the
// commands.

export const USB_RETRY_MS = 60_000
export const USB_MAX_ATTEMPTS = 3
export const NO_CLIENT_GRACE_MS = 60_000
export const TUNNEL_RESET_MIN_GAP_MS = 5 * 60_000

export interface AdbDevice {
  serial: string
  state: string
}

// `adb devices` output: a header line, then "serial<TAB>state" rows.
export function parseAdbDevices(output: string): AdbDevice[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim().split('\t'))
    .filter(parts => parts.length === 2 && parts[0] && parts[1])
    .map(([serial, state]) => ({ serial, state: state.trim() }))
}

export type UsbAction = 'reconnect-offline' | 'restart-server'

export interface UsbRecoveryState {
  // Only recover a device we have seen; never touch adb for a user who
  // simply has no Car Thing plugged in.
  wasFound: boolean
  attempts: number
  lastAttemptAt: number
}

export const initialUsbState: UsbRecoveryState = {
  wasFound: false,
  attempts: 0,
  lastAttemptAt: Number.NEGATIVE_INFINITY
}

export function decideUsbRecovery(
  state: UsbRecoveryState,
  input: { found: boolean; devices: AdbDevice[]; now: number }
): { action: UsbAction | null; next: UsbRecoveryState } {
  if (input.found)
    return { action: null, next: { ...initialUsbState, wasFound: true } }

  if (
    !state.wasFound ||
    state.attempts >= USB_MAX_ATTEMPTS ||
    input.now - state.lastAttemptAt < USB_RETRY_MS
  )
    return { action: null, next: state }

  // An offline device usually comes back with `adb reconnect offline`.
  // A device that vanished from the list may be held by another adb
  // server (e.g. a different adb version), so restart ours.
  const action: UsbAction = input.devices.some(d => d.state === 'offline')
    ? 'reconnect-offline'
    : 'restart-server'

  return {
    action,
    next: {
      wasFound: true,
      attempts: state.attempts + 1,
      lastAttemptAt: input.now
    }
  }
}

export interface TunnelState {
  // When the device became ready with no client connected, or null.
  noClientSince: number | null
  lastResetAt: number
}

export const initialTunnelState: TunnelState = {
  noClientSince: null,
  lastResetAt: Number.NEGATIVE_INFINITY
}

// The device is on USB with the app installed, but its browser has not
// connected for a while: the adb reverse tunnel or the browser is stuck.
export function decideTunnelReset(
  state: TunnelState,
  input: { deviceReady: boolean; hasClient: boolean; now: number }
): { reset: boolean; next: TunnelState } {
  if (!input.deviceReady || input.hasClient)
    return { reset: false, next: { ...state, noClientSince: null } }

  const since = state.noClientSince ?? input.now
  const reset =
    input.now - since >= NO_CLIENT_GRACE_MS &&
    input.now - state.lastResetAt >= TUNNEL_RESET_MIN_GAP_MS

  return reset
    ? { reset, next: { noClientSince: input.now, lastResetAt: input.now } }
    : { reset, next: { ...state, noClientSince: since } }
}
