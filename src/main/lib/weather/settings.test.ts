import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => new Map<string, unknown>())

vi.mock('../storage.js', () => ({
  getStorageValue: (key: string) => store.get(key) ?? null,
  setStorageValue: (key: string, value: unknown) => {
    store.set(key, value)
  }
}))

import { getWeatherSettings, setWeatherSettings } from './settings.js'

const CHICAGO = { name: 'Chicago', latitude: 41.85, longitude: -87.65 }

beforeEach(() => store.clear())

describe('getWeatherSettings', () => {
  it('defaults to no location and imperial', () => {
    expect(getWeatherSettings()).toEqual({
      location: null,
      units: 'imperial'
    })
  })

  it('returns stored values', () => {
    store.set('weatherLocation', CHICAGO)
    store.set('weatherUnits', 'metric')
    expect(getWeatherSettings()).toEqual({
      location: CHICAGO,
      units: 'metric'
    })
  })

  it('rejects junk locations', () => {
    const bad = [
      'Chicago',
      { name: '', latitude: 1, longitude: 1 },
      { name: '  ', latitude: 1, longitude: 1 },
      { name: 'A', latitude: NaN, longitude: 1 },
      { name: 'A', latitude: 1, longitude: Infinity },
      { name: 'A', latitude: '1', longitude: 1 },
      { name: 'A', latitude: 91, longitude: 1 },
      { name: 'A', latitude: -91, longitude: 1 },
      { name: 'A', latitude: 1, longitude: 181 },
      { name: 'A', latitude: 1, longitude: -181 }
    ]
    for (const value of bad) {
      store.set('weatherLocation', value)
      expect(getWeatherSettings().location).toBeNull()
    }
  })

  it('falls back to imperial for unknown units', () => {
    store.set('weatherUnits', 'kelvin')
    expect(getWeatherSettings().units).toBe('imperial')
  })
})

describe('setWeatherSettings', () => {
  it('saves only provided fields', () => {
    const result = setWeatherSettings({ units: 'metric' })
    expect(result).toEqual({ location: null, units: 'metric' })
    expect(store.has('weatherLocation')).toBe(false)
  })

  it('stores a valid location and clears it with null', () => {
    expect(setWeatherSettings({ location: CHICAGO }).location).toEqual(
      CHICAGO
    )
    expect(setWeatherSettings({ location: null }).location).toBeNull()
    expect(store.get('weatherLocation')).toBeNull()
  })

  it('throws on an invalid location and keeps the saved one', () => {
    setWeatherSettings({ location: CHICAGO })
    expect(() =>
      setWeatherSettings({
        location: { name: 'X', latitude: 200, longitude: 0 },
        units: 'metric'
      })
    ).toThrow('Invalid location')
    expect(store.get('weatherLocation')).toEqual(CHICAGO)
    expect(store.has('weatherUnits')).toBe(false)
  })

  it('throws on invalid units and stores nothing', () => {
    expect(() =>
      setWeatherSettings({ location: CHICAGO, units: 'bogus' as never })
    ).toThrow('Invalid units')
    expect(store.has('weatherLocation')).toBe(false)
    expect(store.has('weatherUnits')).toBe(false)
  })
})
