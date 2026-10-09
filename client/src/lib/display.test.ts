import { describe, expect, it } from 'vitest'

import { DISPLAY_FALLBACK, parseDisplay } from './display.ts'

describe('parseDisplay', () => {
  it('turns percents into alphas', () => {
    expect(
      parseDisplay({ sportsTintOpacity: 25, calendarTintOpacity: 45 })
    ).toEqual({ sportsAlpha: 0.25, calendarAlpha: 0.45 })
  })

  it('accepts the 0 and 100 ends', () => {
    expect(
      parseDisplay({ sportsTintOpacity: 0, calendarTintOpacity: 100 })
    ).toEqual({ sportsAlpha: 0, calendarAlpha: 1 })
  })

  it('clamps out-of-range values', () => {
    expect(
      parseDisplay({ sportsTintOpacity: -10, calendarTintOpacity: 150 })
    ).toEqual({ sportsAlpha: 0, calendarAlpha: 1 })
  })

  it('falls back per field', () => {
    expect(
      parseDisplay({ sportsTintOpacity: 'x', calendarTintOpacity: 60 })
    ).toEqual({
      sportsAlpha: DISPLAY_FALLBACK.sportsAlpha,
      calendarAlpha: 0.6
    })
    expect(
      parseDisplay({ sportsTintOpacity: 10, calendarTintOpacity: NaN })
    ).toEqual({
      sportsAlpha: 0.1,
      calendarAlpha: DISPLAY_FALLBACK.calendarAlpha
    })
    expect(parseDisplay({ sportsTintOpacity: Infinity })).toEqual(
      DISPLAY_FALLBACK
    )
  })

  it('falls back for missing or non-object data', () => {
    expect(parseDisplay({})).toEqual(DISPLAY_FALLBACK)
    expect(parseDisplay(null)).toEqual(DISPLAY_FALLBACK)
    expect(parseDisplay(undefined)).toEqual(DISPLAY_FALLBACK)
    expect(parseDisplay('50')).toEqual(DISPLAY_FALLBACK)
    expect(parseDisplay(42)).toEqual(DISPLAY_FALLBACK)
  })
})
