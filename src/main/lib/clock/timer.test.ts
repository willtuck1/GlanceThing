import { describe, expect, it, vi } from 'vitest'

import { createTimer, type TimerAlert, type TimerPayload } from './timer.js'

function setup() {
  let t = 1000
  let pending: { fn: () => void; at: number; id: number } | null = null
  let nextId = 1
  let lastAlert: TimerAlert = 'off'
  let lastMinutes = 5
  const broadcasts: TimerPayload[] = []
  const desktopAlert = vi.fn()
  const timer = createTimer({
    now: () => t,
    setTimeout: (fn, ms) => {
      pending = { fn, at: t + ms, id: nextId++ }
      return pending.id
    },
    clearTimeout: h => {
      if (pending && pending.id === h) pending = null
    },
    broadcast: p => broadcasts.push(p),
    desktopAlert,
    getLastAlert: () => lastAlert,
    setLastAlert: a => (lastAlert = a),
    getLastMinutes: () => lastMinutes,
    setLastMinutes: n => (lastMinutes = n),
  })
  const advance = (ms: number) => {
    t += ms
    if (pending && pending.at <= t) {
      const fn = pending.fn
      pending = null
      fn()
    }
  }
  return {
    timer,
    broadcasts,
    desktopAlert,
    advance,
    hasTimeout: () => pending !== null,
    saved: () => ({ lastAlert, lastMinutes }),
  }
}

const go = { minutes: 2, alert: 'sound' }

describe('timer', () => {
  it('starts idle with last alert', () => {
    const s = setup()
    expect(s.timer.payload()).toMatchObject({
      state: 'idle',
      durationMs: 0,
      remainingMs: 0,
      alert: 'off',
      lastMinutes: 5,
    })
  })

  it('start runs, schedules, saves last settings, broadcasts', () => {
    const s = setup()
    s.timer.start(go)
    expect(s.timer.payload()).toMatchObject({
      state: 'running',
      durationMs: 120000,
      remainingMs: 120000,
      alert: 'sound',
    })
    expect(s.hasTimeout()).toBe(true)
    expect(s.saved()).toEqual({ lastAlert: 'sound', lastMinutes: 2 })
    expect(s.broadcasts.at(-1)?.state).toBe('running')
  })

  it('reconnect mid-run returns live remaining', () => {
    const s = setup()
    s.timer.start(go)
    s.advance(30000)
    expect(s.timer.payload().remainingMs).toBe(90000)
  })

  it('pause and resume preserve remaining', () => {
    const s = setup()
    s.timer.start(go)
    s.advance(30000)
    s.timer.pause()
    expect(s.hasTimeout()).toBe(false)
    s.advance(60000)
    expect(s.timer.payload()).toMatchObject({
      state: 'paused',
      remainingMs: 90000,
    })
    s.timer.resume()
    expect(s.timer.payload().state).toBe('running')
    s.advance(89000)
    expect(s.timer.payload().remainingMs).toBe(1000)
    s.advance(1000)
    expect(s.timer.payload().state).toBe('ringing')
  })

  it('finishing rings and alerts once', () => {
    const s = setup()
    s.timer.start(go)
    s.advance(120000)
    expect(s.timer.payload()).toMatchObject({
      state: 'ringing',
      remainingMs: 0,
    })
    expect(s.desktopAlert).toHaveBeenCalledTimes(1)
    expect(s.desktopAlert).toHaveBeenCalledWith('sound', 120000)
    expect(s.broadcasts.at(-1)?.state).toBe('ringing')
  })

  it('reset from running, paused and ringing', () => {
    const s = setup()
    s.timer.start(go)
    s.timer.reset()
    expect(s.timer.payload().state).toBe('idle')
    expect(s.hasTimeout()).toBe(false)
    s.timer.start(go)
    s.timer.pause()
    s.timer.reset()
    expect(s.timer.payload().state).toBe('idle')
    s.timer.start(go)
    s.advance(120000)
    s.timer.reset()
    expect(s.timer.payload().state).toBe('idle')
  })

  it('dismiss only from ringing', () => {
    const s = setup()
    s.timer.start(go)
    s.timer.dismiss()
    expect(s.timer.payload().state).toBe('running')
    s.advance(120000)
    s.timer.dismiss()
    expect(s.timer.payload().state).toBe('idle')
  })

  it('start while ringing dismisses then starts', () => {
    const s = setup()
    s.timer.start(go)
    s.advance(120000)
    s.timer.start({ minutes: 1, alert: 'off' })
    expect(s.timer.payload()).toMatchObject({
      state: 'running',
      durationMs: 60000,
    })
  })

  it('ignores start while running or paused but rebroadcasts', () => {
    const s = setup()
    s.timer.start(go)
    const n = s.broadcasts.length
    s.timer.start({ minutes: 9, alert: 'off' })
    expect(s.broadcasts.length).toBe(n + 1)
    expect(s.timer.payload().durationMs).toBe(120000)
  })

  it.each([
    null,
    'x',
    {},
    { minutes: 0, alert: 'off' },
    { minutes: 181, alert: 'off' },
    { minutes: 1.5, alert: 'off' },
    { minutes: '5', alert: 'off' },
    { minutes: 5, alert: 'loud' },
    { minutes: 5 },
  ])('ignores invalid start data %j', data => {
    const s = setup()
    s.timer.start(data)
    expect(s.timer.payload().state).toBe('idle')
    expect(s.broadcasts).toHaveLength(1)
    expect(s.hasTimeout()).toBe(false)
    expect(s.saved()).toEqual({ lastAlert: 'off', lastMinutes: 5 })
  })

  it('wrong-state pause/resume rebroadcast without change', () => {
    const s = setup()
    s.timer.pause()
    s.timer.resume()
    expect(s.broadcasts).toHaveLength(2)
    expect(s.timer.payload().state).toBe('idle')
  })

  it('dispose clears the timeout', () => {
    const s = setup()
    s.timer.start(go)
    s.timer.dispose()
    expect(s.hasTimeout()).toBe(false)
  })
})
