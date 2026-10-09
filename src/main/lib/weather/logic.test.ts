import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import {
  ForecastResponse,
  formatClock,
  formatHour,
  buildWeatherView,
  describeCode,
  noLocationView
} from './logic.js'

function fixture(name: string): ForecastResponse {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const imperial = fixture('chicago.json')
const metric = fixture('chicago-metric.json')
// 2:15 PM in Chicago (UTC-5)
const NOW = imperial.hourly.time[14] + 15 * 60

describe('describeCode', () => {
  it('maps WMO codes to a label and icon', () => {
    expect(describeCode(0, true)).toEqual({
      label: 'Clear',
      icon: 'clear'
    })
    expect(describeCode(2, true).icon).toBe('partly')
    expect(describeCode(3, true).icon).toBe('cloudy')
    expect(describeCode(45, true).icon).toBe('fog')
    expect(describeCode(53, true).icon).toBe('drizzle')
    expect(describeCode(63, true).icon).toBe('rain')
    expect(describeCode(81, true).icon).toBe('rain')
    expect(describeCode(73, true).icon).toBe('snow')
    expect(describeCode(95, true).icon).toBe('storm')
  })

  it('uses night variants only for clear and partly cloudy', () => {
    expect(describeCode(0, false).icon).toBe('clear-night')
    expect(describeCode(2, false).icon).toBe('partly-night')
    expect(describeCode(63, false).icon).toBe('rain')
    expect(describeCode(3, false).icon).toBe('cloudy')
  })

  it('falls back for unknown codes', () => {
    expect(describeCode(1234, true)).toEqual({
      label: 'Unknown',
      icon: 'cloudy'
    })
  })
})

describe('buildWeatherView', () => {
  it('builds the imperial view', () => {
    const v = buildWeatherView(imperial, 'Chicago', 'imperial', NOW)
    expect(v.locationName).toBe('Chicago')
    expect(v.units).toBe('imperial')
    expect(v.precipLabel).toBe('0.12 in')
    expect(v.current).toEqual({
      tempLabel: '77°F',
      code: 3,
      label: 'Overcast',
      icon: 'cloudy'
    })
    expect(v.highLabel).toBe('78°')
    expect(v.lowLabel).toBe('61°')
  })

  it('builds the metric view', () => {
    const v = buildWeatherView(metric, 'Chicago', 'metric', NOW)
    expect(v.precipLabel).toBe('3.1 mm')
    expect(v.current.tempLabel).toBe('25°C')
    expect(v.highLabel).toBe('26°')
    expect(v.lowLabel).toBe('16°')
  })

  it('slices 12 hours starting at the current hour', () => {
    const v = buildWeatherView(imperial, 'Chicago', 'imperial', NOW)
    expect(v.hours).toHaveLength(12)
    expect(v.hours[0].timeLabel).toBe('Now')
    expect(v.hours[1].timeLabel).toBe('3 PM')
    expect(v.hours[10].timeLabel).toBe('12 AM')
    expect(v.hours[11].timeLabel).toBe('1 AM')
    expect(v.hours[0].tempLabel).toBe(
      `${Math.round(imperial.hourly.temperature_2m[14] as number)}°`
    )
    expect(v.hours[2].precipPct).toBe(
      imperial.hourly.precipitation_probability[16]
    )
  })

  it('treats null precipitation probability as 0', () => {
    const v = buildWeatherView(
      imperial,
      'Chicago',
      'imperial',
      imperial.hourly.time[7]
    )
    expect(imperial.hourly.precipitation_probability[7]).toBeNull()
    expect(v.hours[0].precipPct).toBe(0)
  })

  it('formats sunrise and sunset in the location timezone', () => {
    // Same assertions must hold under any process timezone; the formatter
    // only uses the response's timezone.
    const v = buildWeatherView(imperial, 'Chicago', 'imperial', NOW)
    expect(v.sunriseLabel).toBe('5:15 AM')
    expect(v.sunsetLabel).toBe('8:28 PM')
  })

  it('falls back to the offset without a timezone', () => {
    const tokyo = {
      ...imperial,
      timezone: undefined,
      utc_offset_seconds: 32400
    }
    const v = buildWeatherView(tokyo, 'Tokyo', 'imperial', NOW)
    // 10:15 UTC sunrise + 9h
    expect(v.sunriseLabel).toBe('7:15 PM')
  })
})

describe('timezones', () => {
  // 2025-11-02 05:00 UTC = 12 AM CDT; DST ends at 07:00 UTC (2 AM CDT -> 1 AM CST).
  const t0 = Date.UTC(2025, 10, 2, 5) / 1000
  const times = Array.from({ length: 6 }, (_, i) => t0 + i * 3600)

  it('follows daylight saving changes inside the window', () => {
    const resp: ForecastResponse = {
      ...imperial,
      timezone: 'America/Chicago',
      utc_offset_seconds: -18000,
      hourly: {
        time: times,
        temperature_2m: times.map(() => 50),
        precipitation_probability: times.map(() => 0)
      }
    }
    const v = buildWeatherView(resp, 'Chicago', 'imperial', t0)
    expect(v.hours.map(h => h.timeLabel)).toEqual([
      'Now',
      '1 AM',
      '1 AM',
      '2 AM',
      '3 AM',
      '4 AM'
    ])
  })

  it('keeps minutes in half-hour zones', () => {
    // 2025-06-01 00:00 UTC = 5:30 AM in Kolkata
    const sec = Date.UTC(2025, 5, 1) / 1000
    expect(formatClock(sec, 19800, 'Asia/Kolkata')).toBe('5:30 AM')
    expect(formatHour(sec, 19800, 'Asia/Kolkata')).toBe('5 AM')
    const resp = {
      ...imperial,
      timezone: 'Asia/Kolkata',
      utc_offset_seconds: 19800,
      daily: { ...imperial.daily, sunrise: [sec + 45 * 60] }
    }
    expect(
      buildWeatherView(resp, 'Delhi', 'metric', NOW).sunriseLabel
    ).toBe('6:15 AM')
  })

  it('falls back to the offset for a missing or unknown zone', () => {
    const sec = Date.UTC(2025, 5, 1, 12, 30) / 1000
    expect(formatClock(sec, -18000)).toBe('7:30 AM')
    expect(formatClock(sec, -18000, 'Not/AZone')).toBe('7:30 AM')
  })
})

describe('response validation', () => {
  const bad = (mutate: (r: ForecastResponse) => void) => {
    const r = structuredClone(imperial)
    mutate(r)
    return () => buildWeatherView(r, 'Chicago', 'imperial', NOW)
  }

  it('throws on missing or empty data', () => {
    const msg = 'Unexpected Open-Meteo response'
    expect(bad(r => (r.current.temperature_2m = null as never))).toThrow(
      msg
    )
    expect(bad(r => (r.current = undefined as never))).toThrow(msg)
    expect(bad(r => (r.daily.temperature_2m_max = []))).toThrow(msg)
    expect(
      bad(r => (r.daily.temperature_2m_min = undefined as never))
    ).toThrow(msg)
    expect(bad(r => (r.daily.sunrise = []))).toThrow(msg)
    expect(bad(r => (r.daily.sunset = [null as never]))).toThrow(msg)
    expect(bad(r => (r.daily.precipitation_sum = []))).toThrow(msg)
    expect(bad(r => (r.hourly.time = []))).toThrow(msg)
    expect(bad(r => (r.hourly.temperature_2m = []))).toThrow(msg)
  })

  it('skips hours with a null temperature', () => {
    const r = structuredClone(imperial)
    r.hourly.temperature_2m[16] = null
    const v = buildWeatherView(r, 'Chicago', 'imperial', NOW)
    expect(v.hours).toHaveLength(12)
    expect(v.hours.map(h => h.timeLabel)).not.toContain('4 PM')
    expect(v.hours[2].timeLabel).toBe('5 PM')
    expect(v.hours.every(h => h.tempLabel !== '0°')).toBe(true)
  })
})

describe('noLocationView', () => {
  it('prompts for a location', () => {
    expect(noLocationView()).toEqual({
      kind: 'none',
      message: 'Set a location in Settings'
    })
  })
})
