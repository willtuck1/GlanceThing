import { describe, expect, it, vi } from 'vitest'

import {
  anchorFrom,
  digits,
  formatRemaining,
  handAngles,
  hostNow,
  localFields
} from './clockTime.ts'

describe('anchor', () => {
  it('advances with the perf delta only, ignoring Date.now', () => {
    const a = anchorFrom({ now: 1_000_000, offsetMin: 0 }, 500)!
    vi.spyOn(Date, 'now').mockReturnValue(42)
    expect(hostNow(a, 500)).toBe(1_000_000)
    expect(hostNow(a, 2500)).toBe(1_002_000)
    vi.restoreAllMocks()
  })

  it('resync replaces the anchor', () => {
    const a = anchorFrom({ now: 1_000_000, offsetMin: 0 }, 0)!
    const b = anchorFrom({ now: 1_010_000, offsetMin: 0 }, 9000)!
    expect(hostNow(a, 9000)).toBe(1_009_000)
    expect(hostNow(b, 9000)).toBe(1_010_000)
  })

  it('is null for old or invalid payloads', () => {
    expect(anchorFrom({ time: '1:00', date: 'x' }, 0)).toBeNull()
    expect(anchorFrom({ now: NaN, offsetMin: 0 }, 0)).toBeNull()
    expect(anchorFrom({ now: 1, offsetMin: Infinity }, 0)).toBeNull()
    expect(anchorFrom(undefined, 0)).toBeNull()
  })
})

describe('localFields', () => {
  const ms = Date.UTC(2025, 0, 1, 23, 30, 15)
  it('crosses midnight forward with positive offset', () => {
    const f = localFields(ms, 120)
    expect([f.year, f.month, f.day, f.h, f.m, f.s]).toEqual([
      2025, 1, 2, 1, 30, 15
    ])
    expect(f.weekday).toBe(4)
  })
  it('crosses midnight backward with negative offset', () => {
    const f = localFields(Date.UTC(2025, 0, 1, 1, 0, 0), -120)
    expect([f.year, f.month, f.day, f.h, f.m]).toEqual([
      2024, 12, 31, 23, 0
    ])
    expect(f.weekday).toBe(2)
  })
})

describe('handAngles', () => {
  it('3:00', () => expect(handAngles(3, 0, 0).hour).toBe(90))
  it('12:30', () => {
    const a = handAngles(12, 30, 0)
    expect(a.hour).toBe(15)
    expect(a.minute).toBe(180)
  })
  it('9:45:30', () => {
    const a = handAngles(9, 45, 30)
    expect(a.hour).toBeCloseTo(292.75)
    expect(a.minute).toBeCloseTo(273)
    expect(a.second).toBe(180)
  })
})

describe('digits', () => {
  it('12h', () => {
    expect(digits(0, 5, true)).toEqual({
      hh: '12',
      mm: '05',
      suffix: 'AM'
    })
    expect(digits(13, 7, true)).toEqual({
      hh: '1',
      mm: '07',
      suffix: 'PM'
    })
    expect(digits(12, 0, true)).toEqual({
      hh: '12',
      mm: '00',
      suffix: 'PM'
    })
  })
  it('24h', () => {
    expect(digits(0, 5, false)).toEqual({ hh: '00', mm: '05', suffix: '' })
    expect(digits(13, 7, false)).toEqual({
      hh: '13',
      mm: '07',
      suffix: ''
    })
  })
})

describe('formatRemaining', () => {
  it('formats', () => {
    expect(formatRemaining(59999)).toBe('1:00')
    expect(formatRemaining(3600000)).toBe('1:00:00')
    expect(formatRemaining(61000)).toBe('1:01')
    expect(formatRemaining(0)).toBe('0:00')
    expect(formatRemaining(-5)).toBe('0:00')
  })
})
