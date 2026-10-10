import { describe, expect, it } from 'vitest'

import { CLOCK_DEFAULTS, parseClock } from './clockSettings.ts'

describe('parseClock', () => {
  it('falls back to defaults for old hosts and garbage', () => {
    for (const v of [undefined, null, 5, 'x', [], {}]) {
      expect(parseClock(v)).toEqual(CLOCK_DEFAULTS)
    }
  })

  it('accepts valid styles and rejects invalid ones', () => {
    expect(
      parseClock({ tabStyle: 'analog', sleepStyle: 'analog' })
    ).toMatchObject({ tabStyle: 'analog', sleepStyle: 'analog' })
    expect(parseClock({ tabStyle: 'neon', sleepStyle: 3 })).toMatchObject({
      tabStyle: 'digital',
      sleepStyle: 'digital'
    })
  })

  it('keeps only string widgets and strict keyDebug', () => {
    expect(
      parseClock({ widgets: ['todo', 3, null, 'weather'] }).widgets
    ).toEqual(['todo', 'weather'])
    expect(parseClock({ widgets: [] }).widgets).toEqual([])
    expect(parseClock({ widgets: 'todo' }).widgets).toEqual(
      CLOCK_DEFAULTS.widgets
    )
    expect(parseClock({ keyDebug: true }).keyDebug).toBe(true)
    expect(parseClock({ keyDebug: 'yes' }).keyDebug).toBe(false)
  })
})
