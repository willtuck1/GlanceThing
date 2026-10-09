import { readFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'

import { Get, fetchForecast, searchLocations } from './openMeteo.js'

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const CHICAGO = { latitude: 41.85, longitude: -87.65 }

describe('fetchForecast', () => {
  it('requests imperial units', async () => {
    const body = fixture('chicago.json')
    const get = vi.fn<Get>(async () => body)
    expect(await fetchForecast(CHICAGO, 'imperial', get)).toBe(body)
    const url = new URL(get.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe(
      'https://api.open-meteo.com/v1/forecast'
    )
    expect(url.searchParams.get('latitude')).toBe('41.85')
    expect(url.searchParams.get('longitude')).toBe('-87.65')
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit')
    expect(url.searchParams.get('precipitation_unit')).toBe('inch')
    expect(url.searchParams.get('timezone')).toBe('auto')
    expect(url.searchParams.get('timeformat')).toBe('unixtime')
    expect(url.searchParams.get('forecast_days')).toBe('2')
    expect(url.searchParams.get('current')).toBe(
      'temperature_2m,weather_code,is_day'
    )
    expect(url.searchParams.get('hourly')).toBe(
      'temperature_2m,precipitation_probability,precipitation'
    )
    expect(url.searchParams.get('daily')).toBe(
      'temperature_2m_max,temperature_2m_min,sunrise,sunset,weather_code'
    )
  })

  it('requests metric units', async () => {
    const get = vi.fn<Get>(async () => ({}))
    await fetchForecast(CHICAGO, 'metric', get)
    const url = new URL(get.mock.calls[0][0])
    expect(url.searchParams.get('temperature_unit')).toBe('celsius')
    expect(url.searchParams.get('precipitation_unit')).toBe('mm')
  })
})

describe('searchLocations', () => {
  it('builds labels and skips missing admin1 or country', async () => {
    const get = vi.fn<Get>(async () => fixture('chicago-geocode.json'))
    const results = await searchLocations('  Chicago ', get)
    expect(get).toHaveBeenCalledTimes(1)
    const url = new URL(get.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe(
      'https://geocoding-api.open-meteo.com/v1/search'
    )
    expect(url.searchParams.get('name')).toBe('Chicago')
    expect(url.searchParams.get('count')).toBe('8')
    expect(url.searchParams.get('language')).toBe('en')
    expect(url.searchParams.get('format')).toBe('json')
    expect(results).toEqual([
      {
        name: 'Chicago',
        label: 'Chicago, Illinois, United States',
        latitude: 41.85003,
        longitude: -87.65005
      },
      {
        name: 'Chicago Heights',
        label: 'Chicago Heights, Illinois, United States',
        latitude: 41.50615,
        longitude: -87.63562
      },
      {
        name: 'Chicago',
        label: 'Chicago',
        latitude: 41.85,
        longitude: -87.65
      }
    ])
  })

  it('returns an empty array when there are no results', async () => {
    const get = vi.fn<Get>(async () => ({ generationtime_ms: 0.4 }))
    expect(await searchLocations('zzzzzz', get)).toEqual([])
  })

  it('does not call the API for an empty query', async () => {
    const get = vi.fn()
    expect(await searchLocations('   ', get)).toEqual([])
    expect(get).not.toHaveBeenCalled()
  })
})
