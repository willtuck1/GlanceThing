import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => new Map<string, unknown>())

vi.mock('../storage.js', () => ({
  getStorageValue: (key: string) => store.get(key) ?? null,
  setStorageValue: (key: string, value: unknown) => {
    store.set(key, value)
  }
}))

import {
  clockPayload,
  getClockSettings,
  getLastAlert,
  getLastMinutes,
  normalizeClockSettings,
  setClockSettings,
  setLastAlert,
  setLastMinutes
} from './settings.js'

const ALL = ['weather', 'calendar', 'todo', 'sports', 'fantasy']

beforeEach(() => store.clear())

describe('normalizeClockSettings', () => {
  it('returns defaults for garbage', () => {
    for (const g of [null, undefined, 5, 'x', [], { widgets: 3 }]) {
      expect(normalizeClockSettings(g)).toEqual({
        tabStyle: 'digital',
        sleepStyle: 'digital',
        widgets: { order: ALL, hidden: [] },
        defaultAlert: 'notify',
        keyDebug: false
      })
    }
  })

  it('accepts both styles and rejects invalid', () => {
    const s = normalizeClockSettings({
      tabStyle: 'analog',
      sleepStyle: 'x'
    })
    expect(s.tabStyle).toBe('analog')
    expect(s.sleepStyle).toBe('digital')
    expect(
      normalizeClockSettings({ sleepStyle: 'analog' }).sleepStyle
    ).toBe('analog')
  })

  it('drops unknown and duplicate widgets, appends missing', () => {
    const s = normalizeClockSettings({
      widgets: { order: ['sports', 'bogus', 'sports', 'weather'] }
    })
    expect(s.widgets.order).toEqual([
      'sports',
      'weather',
      'calendar',
      'todo',
      'fantasy'
    ])
  })

  it('allows zero widgets and filters hidden', () => {
    const all = normalizeClockSettings({ widgets: { hidden: [...ALL] } })
    expect(all.widgets.hidden).toEqual(ALL)
    expect(clockPayload(all).widgets).toEqual([])
    const some = normalizeClockSettings({
      widgets: {
        order: ['todo'],
        hidden: ['fantasy', 'x', 'fantasy', 'todo']
      }
    })
    expect(some.widgets.hidden).toEqual(['todo', 'fantasy'])
  })

  it('keyDebug must be true', () => {
    expect(normalizeClockSettings({ keyDebug: true }).keyDebug).toBe(true)
    expect(normalizeClockSettings({ keyDebug: 1 }).keyDebug).toBe(false)
  })
})

describe('storage', () => {
  it('merges and stores', () => {
    setClockSettings({ tabStyle: 'analog' })
    setClockSettings({ keyDebug: true })
    expect(getClockSettings()).toMatchObject({
      tabStyle: 'analog',
      keyDebug: true
    })
  })

  it('defaultAlert change resets lastAlert', () => {
    setLastAlert('off')
    setClockSettings({ tabStyle: 'analog' })
    expect(getLastAlert()).toBe('off')
    setClockSettings({ defaultAlert: 'sound' })
    expect(getLastAlert()).toBe('sound')
  })

  it('lastAlert falls back to default and ignores invalid', () => {
    expect(getLastAlert()).toBe('notify')
    setLastAlert('nope')
    expect(getLastAlert()).toBe('notify')
    store.set('clockLastAlert', 'zzz')
    expect(getLastAlert()).toBe('notify')
  })

  it('lastMinutes clamps', () => {
    expect(getLastMinutes()).toBe(5)
    setLastMinutes(500)
    expect(getLastMinutes()).toBe(180)
    setLastMinutes(0)
    expect(getLastMinutes()).toBe(1)
    setLastMinutes(7.6)
    expect(getLastMinutes()).toBe(8)
    setLastMinutes(NaN)
    expect(getLastMinutes()).toBe(8)
  })

  it('clockPayload filters hidden and keeps order', () => {
    const s = normalizeClockSettings({
      widgets: { order: ['sports', 'weather'], hidden: ['weather'] }
    })
    expect(clockPayload(s)).toEqual({
      tabStyle: 'digital',
      sleepStyle: 'digital',
      widgets: ['sports', 'calendar', 'todo', 'fantasy'],
      keyDebug: false
    })
  })
})
