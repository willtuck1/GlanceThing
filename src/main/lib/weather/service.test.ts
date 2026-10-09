import { describe, expect, it, vi } from 'vitest'

vi.mock('../storage.js', () => ({
  getStorageValue: () => null,
  setStorageValue: () => {}
}))

import { applyWeatherSettings, createWeatherFetcher } from './service.js'
import { noLocationView } from './logic.js'

const loc = { name: 'Austin', latitude: 30.27, longitude: -97.74 }

describe('createWeatherFetcher', () => {
  it('returns the no-location view without any HTTP', async () => {
    const getForecast = vi.fn()
    const fetch = createWeatherFetcher({
      getSettings: () => ({ location: null, units: 'imperial' }),
      getForecast,
      now: () => 0
    })
    expect(await fetch()).toEqual([noLocationView()])
    expect(getForecast).not.toHaveBeenCalled()
  })

  it('fetches the forecast for the saved location', async () => {
    const hour = 1_700_000_000
    const resp = {
      utc_offset_seconds: 0,
      current: { temperature_2m: 70, weather_code: 0, is_day: 1 },
      hourly: {
        time: [hour, hour + 3600],
        temperature_2m: [70, 71],
        precipitation_probability: [0, 10],
        precipitation: [0, 0]
      },
      daily: {
        time: [hour],
        temperature_2m_max: [75],
        temperature_2m_min: [60],
        sunrise: [hour],
        sunset: [hour + 40000],
        weather_code: [0]
      }
    }
    const getForecast = vi.fn().mockResolvedValue(resp)
    const fetch = createWeatherFetcher({
      getSettings: () => ({ location: loc, units: 'metric' }),
      getForecast,
      now: () => hour * 1000 + 5000
    })
    const items = await fetch()
    expect(getForecast).toHaveBeenCalledWith(loc, 'metric')
    expect(items).toHaveLength(1)
    expect(items[0].kind).not.toBe('none')
  })
})

describe('applyWeatherSettings', () => {
  it('saves, then resets and refetches the feed', () => {
    const calls: string[] = []
    const feed = {
      reset: () => void calls.push('reset'),
      refetch: () => {
        calls.push('refetch')
        return Promise.resolve()
      }
    }
    const save = vi.fn(() => {
      calls.push('save')
      return { location: loc, units: 'imperial' as const }
    })
    const result = applyWeatherSettings({ location: loc }, feed, save)
    expect(calls).toEqual(['save', 'reset', 'refetch'])
    expect(result.location).toEqual(loc)
  })

  it('still saves when the feed is not running', () => {
    const save = vi.fn(() => ({
      location: null,
      units: 'metric' as const
    }))
    expect(
      applyWeatherSettings({ units: 'metric' }, null, save).units
    ).toBe('metric')
  })
})
