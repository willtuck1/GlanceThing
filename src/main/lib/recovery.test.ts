import { describe, expect, it } from 'vitest'

import {
  decideTunnelReset,
  decideUsbRecovery,
  initialTunnelState,
  initialUsbState,
  NO_CLIENT_GRACE_MS,
  parseAdbDevices,
  TUNNEL_RESET_MIN_GAP_MS,
  USB_MAX_ATTEMPTS,
  USB_RETRY_MS,
  UsbRecoveryState
} from './recovery.js'

describe('parseAdbDevices', () => {
  it('reads serials and states, skipping the header', () => {
    const out =
      'List of devices attached\r\n8551c4a1\toffline\r\nemulator-5554\tdevice\r\n\r\n'
    expect(parseAdbDevices(out)).toEqual([
      { serial: '8551c4a1', state: 'offline' },
      { serial: 'emulator-5554', state: 'device' }
    ])
  })

  it('handles an empty list', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([])
  })
})

describe('decideUsbRecovery', () => {
  const seen: UsbRecoveryState = { ...initialUsbState, wasFound: true }

  it('does nothing for a device that was never found', () => {
    expect(
      decideUsbRecovery(initialUsbState, {
        found: false,
        devices: [],
        now: 0
      }).action
    ).toBeNull()
  })

  it('reconnects an offline device', () => {
    const { action } = decideUsbRecovery(seen, {
      found: false,
      devices: [{ serial: 'x', state: 'offline' }],
      now: 0
    })
    expect(action).toBe('reconnect-offline')
  })

  it('restarts the adb server when the device vanished', () => {
    const { action } = decideUsbRecovery(seen, {
      found: false,
      devices: [],
      now: 0
    })
    expect(action).toBe('restart-server')
  })

  it(`waits ${USB_RETRY_MS} ms between tries and stops after ${USB_MAX_ATTEMPTS}`, () => {
    let state = seen
    const actions: (string | null)[] = []
    for (let now = 0; now <= 5 * USB_RETRY_MS; now += USB_RETRY_MS / 2) {
      const r = decideUsbRecovery(state, {
        found: false,
        devices: [],
        now
      })
      actions.push(r.action)
      state = r.next
    }
    expect(actions.filter(Boolean)).toHaveLength(USB_MAX_ATTEMPTS)
    expect(actions.slice(0, 3)).toEqual([
      'restart-server',
      null,
      'restart-server'
    ])
  })

  it('starts over once the device is found again', () => {
    const tired: UsbRecoveryState = {
      wasFound: true,
      attempts: USB_MAX_ATTEMPTS,
      lastAttemptAt: 0
    }
    const { next } = decideUsbRecovery(tired, {
      found: true,
      devices: [],
      now: 1
    })
    expect(next).toEqual({ ...initialUsbState, wasFound: true })
  })
})

describe('decideTunnelReset', () => {
  function run(steps: { ready: boolean; client: boolean; now: number }[]) {
    let state = initialTunnelState
    return steps.map(s => {
      const r = decideTunnelReset(state, {
        deviceReady: s.ready,
        hasClient: s.client,
        now: s.now
      })
      state = r.next
      return r.reset
    })
  }

  it(`resets after ${NO_CLIENT_GRACE_MS} ms ready with no client`, () => {
    expect(
      run([
        { ready: true, client: false, now: 0 },
        { ready: true, client: false, now: NO_CLIENT_GRACE_MS - 1 },
        { ready: true, client: false, now: NO_CLIENT_GRACE_MS }
      ])
    ).toEqual([false, false, true])
  })

  it('never resets while a client is connected or the device is missing', () => {
    expect(
      run([
        { ready: true, client: true, now: 0 },
        { ready: true, client: true, now: 10 * NO_CLIENT_GRACE_MS },
        { ready: false, client: false, now: 20 * NO_CLIENT_GRACE_MS },
        { ready: false, client: false, now: 30 * NO_CLIENT_GRACE_MS }
      ])
    ).toEqual([false, false, false, false])
  })

  it('restarts the countdown when a client connects', () => {
    expect(
      run([
        { ready: true, client: false, now: 0 },
        { ready: true, client: true, now: NO_CLIENT_GRACE_MS / 2 },
        { ready: true, client: false, now: NO_CLIENT_GRACE_MS },
        { ready: true, client: false, now: NO_CLIENT_GRACE_MS * 1.5 }
      ])
    ).toEqual([false, false, false, false])
  })

  it(`waits ${TUNNEL_RESET_MIN_GAP_MS} ms between resets`, () => {
    const g = NO_CLIENT_GRACE_MS
    const steps: { ready: boolean; client: boolean; now: number }[] = []
    for (let now = 0; now <= TUNNEL_RESET_MIN_GAP_MS + 2 * g; now += g)
      steps.push({ ready: true, client: false, now })
    const resets = run(steps)
    const at = resets.flatMap((r, i) => (r ? [steps[i].now] : []))
    expect(at).toEqual([g, g + TUNNEL_RESET_MIN_GAP_MS])
  })
})
