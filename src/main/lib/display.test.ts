import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => new Map<string, unknown>())

vi.mock('./storage.js', () => ({
  getStorageValue: (key: string) => store.get(key) ?? null,
  setStorageValue: (key: string, value: unknown) => {
    store.set(key, value)
  }
}))

import {
  DISPLAY_DEFAULTS,
  getDisplaySettings,
  setDisplaySettings
} from './display.js'
import { handle } from './handlers/display.js'

beforeEach(() => store.clear())

describe('getDisplaySettings', () => {
  it('returns defaults when storage is empty', () => {
    expect(getDisplaySettings()).toEqual(DISPLAY_DEFAULTS)
    expect(DISPLAY_DEFAULTS).toEqual({
      sportsTintOpacity: 25,
      calendarTintOpacity: 45
    })
  })

  it('returns stored values', () => {
    store.set('sportsTintOpacity', 10)
    store.set('calendarTintOpacity', 80)
    expect(getDisplaySettings()).toEqual({
      sportsTintOpacity: 10,
      calendarTintOpacity: 80
    })
  })

  it('clamps and rounds', () => {
    store.set('sportsTintOpacity', -5)
    store.set('calendarTintOpacity', 150)
    expect(getDisplaySettings()).toEqual({
      sportsTintOpacity: 0,
      calendarTintOpacity: 100
    })
    store.set('sportsTintOpacity', 33.6)
    expect(getDisplaySettings().sportsTintOpacity).toBe(34)
  })

  it('falls back to defaults for non-numeric values', () => {
    store.set('sportsTintOpacity', 'abc')
    store.set('calendarTintOpacity', NaN)
    expect(getDisplaySettings()).toEqual(DISPLAY_DEFAULTS)
  })
})

describe('setDisplaySettings', () => {
  it('saves only provided fields and returns merged settings', () => {
    const result = setDisplaySettings({ sportsTintOpacity: 60.4 })
    expect(result).toEqual({ sportsTintOpacity: 60, calendarTintOpacity: 45 })
    expect(store.has('calendarTintOpacity')).toBe(false)
    expect(store.get('sportsTintOpacity')).toBe(60)
  })

  it('clamps saved values', () => {
    expect(setDisplaySettings({ calendarTintOpacity: 999 })).toEqual({
      sportsTintOpacity: 25,
      calendarTintOpacity: 100
    })
  })
})

describe('display handler', () => {
  it('sends the settings payload', async () => {
    store.set('sportsTintOpacity', 12)
    const ws = { send: vi.fn() }
    await handle(ws as never, undefined as never)
    expect(ws.send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      type: 'display',
      data: { sportsTintOpacity: 12, calendarTintOpacity: 45 }
    })
  })
})
