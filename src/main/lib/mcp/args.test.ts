import { describe, expect, it } from 'vitest'
import { resolveArgs } from './args.js'
import type { ArgValue } from './recipes.js'

const r = (a: Record<string, ArgValue>, tz: string, now: string, s = {}) =>
  resolveArgs(a, s, new Date(now), tz)

describe('resolveArgs', () => {
  it('formats in New York (EDT) with offset', () => {
    const o = r(
      {
        a: { $host: 'dayStart' },
        b: { $host: 'dayEnd' },
        c: { $host: 'today' },
        d: { $host: 'now' }
      },
      'America/New_York',
      '2026-10-10T15:30:00.123Z'
    )
    expect(o).toEqual({
      a: '2026-10-10T00:00:00.000-04:00',
      b: '2026-10-10T23:59:59.999-04:00',
      c: '2026-10-10',
      d: '2026-10-10T11:30:00.123-04:00'
    })
  })
  it('handles the DST end on 2026-11-01', () => {
    const o = r(
      {
        s: { $host: 'dayStart' },
        e: { $host: 'dayEnd' },
        prev: { $host: 'dayEnd', offsetDays: -1 },
        next: { $host: 'dayStart', offsetDays: 1 }
      },
      'America/New_York',
      '2026-11-01T12:00:00Z'
    )
    expect(o).toEqual({
      s: '2026-11-01T00:00:00.000-04:00',
      e: '2026-11-01T23:59:59.999-05:00',
      prev: '2026-10-31T23:59:59.999-04:00',
      next: '2026-11-02T00:00:00.000-05:00'
    })
  })
  it('offsetDays crosses the DST boundary', () => {
    const o = r(
      { a: { $host: 'dayStart', offsetDays: 7 } },
      'America/New_York',
      '2026-10-27T12:00:00Z'
    )
    expect(o.a).toBe('2026-11-03T00:00:00.000-05:00')
  })
  it('handles Asia/Kolkata', () => {
    const o = r(
      {
        a: { $host: 'dayStart' },
        b: { $host: 'dayEnd', format: 'date' },
        c: { $host: 'now' }
      },
      'Asia/Kolkata',
      '2026-10-10T20:00:00Z'
    )
    expect(o).toEqual({
      a: '2026-10-11T00:00:00.000+05:30',
      b: '2026-10-11',
      c: '2026-10-11T01:30:00.000+05:30'
    })
  })
  it('handles UTC and epochMs', () => {
    const o = r(
      {
        a: { $host: 'dayStart', format: 'epochMs' },
        b: { $host: 'now', format: 'epochMs' },
        c: { $host: 'dayStart', offsetDays: -2, format: 'iso' }
      },
      'UTC',
      '2026-10-10T15:30:00.000Z'
    )
    expect(o).toEqual({
      a: Date.UTC(2026, 9, 10),
      b: Date.parse('2026-10-10T15:30:00.000Z'),
      c: '2026-10-08T00:00:00.000+00:00'
    })
  })
  it('resolves nested values, settings and literals', () => {
    const o = r(
      {
        n: 5,
        t: true,
        z: null,
        arr: [{ $setting: 'list' }, { x: { $host: 'today' } }, 'lit'],
        missing: { $setting: 'other' }
      },
      'UTC',
      '2026-01-02T03:00:00Z',
      { list: 'inbox' }
    )
    expect(o).toEqual({
      n: 5,
      t: true,
      z: null,
      arr: ['inbox', { x: '2026-01-02' }, 'lit'],
      missing: ''
    })
  })
})
