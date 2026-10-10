import { describe, expect, it } from 'vitest'

import {
  accumulateWheel,
  initialUi,
  step,
  stepMinutes
} from './timerControls.ts'

import type { TimerState, TimerUi } from './timerControls.ts'

const idle: TimerState = { state: 'idle' }
const ui = (p: Partial<TimerUi> = {}): TimerUi => ({
  ...initialUi(),
  ...p
})

describe('idle', () => {
  it('turn or press opens minutes from the last values', () => {
    const t: TimerState = {
      state: 'idle',
      lastMinutes: 12,
      lastAlert: 'sound'
    }
    for (const i of ['turnUp', 'turnDown', 'press'] as const) {
      const r = step(ui(), i, t, 100)
      expect(r.ui).toMatchObject({
        mode: 'minutes',
        minutes: 12,
        alert: 'sound',
        lastInputAt: 100
      })
      expect(r.command).toBeUndefined()
    }
  })

  it('defaults to 5 minutes', () => {
    expect(step(ui(), 'press', idle).ui.minutes).toBe(5)
  })

  it('steps minutes by 1 below 60 and 5 from 60, clamped', () => {
    expect(stepMinutes(59, 1)).toBe(60)
    expect(stepMinutes(60, 1)).toBe(65)
    expect(stepMinutes(65, -1)).toBe(60)
    expect(stepMinutes(60, -1)).toBe(59)
    expect(stepMinutes(1, -1)).toBe(1)
    expect(stepMinutes(180, 1)).toBe(180)
    expect(stepMinutes(178, 1)).toBe(180)
    expect(
      step(ui({ mode: 'minutes', minutes: 10 }), 'turnUp', idle).ui.minutes
    ).toBe(11)
  })

  it('press in minutes goes to alert', () => {
    expect(step(ui({ mode: 'minutes' }), 'press', idle).ui.mode).toBe(
      'alert'
    )
  })

  it('cycles alert both ways', () => {
    const a = (
      alert: 'off' | 'notify' | 'sound',
      i: 'turnUp' | 'turnDown'
    ) => step(ui({ mode: 'alert', alert }), i, idle).ui.alert
    expect(a('off', 'turnUp')).toBe('notify')
    expect(a('notify', 'turnUp')).toBe('sound')
    expect(a('sound', 'turnUp')).toBe('off')
    expect(a('off', 'turnDown')).toBe('sound')
    expect(a('sound', 'turnDown')).toBe('notify')
  })

  it('press in alert starts the timer and returns to view', () => {
    const r = step(
      ui({ mode: 'alert', minutes: 25, alert: 'sound' }),
      'press',
      idle
    )
    expect(r.command).toEqual({
      action: 'start',
      data: { minutes: 25, alert: 'sound' }
    })
    expect(r.ui.mode).toBe('view')
  })

  it('times out after 20 s without input', () => {
    const s = ui({ mode: 'minutes', lastInputAt: 1000 })
    expect(step(s, 'tick', idle, 20999).ui.mode).toBe('minutes')
    expect(step(s, 'tick', idle, 21000).ui.mode).toBe('view')
    const a = ui({ mode: 'alert', lastInputAt: 1000 })
    expect(step(a, 'tick', idle, 21000).ui.mode).toBe('view')
  })
})

describe('running, paused, ringing', () => {
  it('running: press pauses, turn ignored', () => {
    const t: TimerState = { state: 'running' }
    expect(step(ui(), 'press', t).command).toEqual({ action: 'pause' })
    expect(step(ui(), 'turnUp', t).command).toBeUndefined()
  })

  it('paused: turn toggles choice, press sends it', () => {
    const t: TimerState = { state: 'paused' }
    expect(step(ui(), 'press', t).command).toEqual({ action: 'resume' })
    const r = step(ui(), 'turnUp', t)
    expect(r.ui).toMatchObject({ mode: 'pausedChoice', choice: 'reset' })
    expect(step(r.ui, 'press', t).command).toEqual({ action: 'reset' })
    expect(step(r.ui, 'turnDown', t).ui.choice).toBe('resume')
  })

  it('ringing: nothing', () => {
    const t: TimerState = { state: 'ringing' }
    for (const i of ['turnUp', 'turnDown', 'press'] as const) {
      const r = step(ui(), i, t)
      expect(r.command).toBeUndefined()
      expect(r.ui).toEqual(ui())
    }
  })
})

describe('accumulateWheel', () => {
  it('accumulates to 40 in either direction', () => {
    let r = accumulateWheel(0, 15)
    expect(r).toEqual({ acc: 15, step: 0 })
    r = accumulateWheel(r.acc, 30)
    expect(r).toEqual({ acc: 0, step: 1 })
    expect(accumulateWheel(0, -40)).toEqual({ acc: 0, step: -1 })
    expect(accumulateWheel(20, -30)).toEqual({ acc: -10, step: 0 })
  })
})
