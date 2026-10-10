import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  show: vi.fn(),
  close: vi.fn(),
  broadcast: vi.fn(),
  hasClient: true,
  adbFails: false,
  auto: false,
  lastAlert: 'notify' as string
}))

vi.mock('../server.js', () => ({
  serverManager: {
    broadcast: h.broadcast,
    hasClient: () => h.hasClient
  }
}))
vi.mock('../adb.js', () => ({
  setAutoBrightness: vi.fn(async () => {
    if (h.adbFails) throw new Error('adb')
  }),
  setBrightnessSmooth: vi.fn(async () => {
    if (h.adbFails) throw new Error('adb')
  })
}))
vi.mock('../../lib/utils.js', () => ({
  log: vi.fn(),
  LogLevel: { WARN: 'warn' }
}))
vi.mock('../storage.js', () => ({
  getStorageValue: (k: string) => (k === 'autoBrightness' ? h.auto : undefined)
}))
vi.mock('./settings.js', () => ({
  getLastAlert: () => h.lastAlert,
  setLastAlert: (a: string) => {
    h.lastAlert = a
  },
  getLastMinutes: () => 5,
  setLastMinutes: vi.fn()
}))
vi.mock('./desktopAlert.js', () => ({
  showTimerNotification: h.show,
  closeTimerNotification: h.close
}))

import { setAutoBrightness, setBrightnessSmooth } from '../adb.js'
import { getTimer } from './instance.js'

beforeEach(() => {
  vi.useFakeTimers()
  h.show.mockClear()
  h.close.mockClear()
  h.broadcast.mockClear()
  h.adbFails = false
  h.auto = false
  h.hasClient = true
  getTimer().reset()
  h.close.mockClear()
})

describe('timer instance', () => {
  it('ringing shows the chosen alert and lights the device', async () => {
    getTimer().start({ minutes: 1, alert: 'sound' })
    expect(h.show).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000 + 10)
    expect(h.show).toHaveBeenCalledWith(
      'sound',
      60_000,
      expect.any(Function)
    )
    expect(setBrightnessSmooth).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('dismiss closes the notification', () => {
    getTimer().start({ minutes: 1, alert: 'notify' })
    vi.advanceTimersByTime(60_010)
    h.close.mockClear()
    getTimer().dismiss()
    expect(h.close).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('starting a new timer while ringing closes it', () => {
    getTimer().start({ minutes: 1, alert: 'notify' })
    vi.advanceTimersByTime(60_010)
    h.close.mockClear()
    getTimer().start({ minutes: 2, alert: 'notify' })
    expect(h.close).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('adb errors while lighting the device are swallowed', async () => {
    h.adbFails = true
    h.auto = true
    getTimer().start({ minutes: 1, alert: 'notify' })
    vi.advanceTimersByTime(60_010)
    await vi.advanceTimersByTimeAsync(0)
    expect(setAutoBrightness).toHaveBeenCalled()
    expect(getTimer().payload().state).toBe('ringing')
    vi.useRealTimers()
  })
})
