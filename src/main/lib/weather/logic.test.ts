import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import {
  ForecastResponse,
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
    expect(v.precipUnit).toBe('in')
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
    expect(v.precipUnit).toBe('mm')
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
      `${Math.round(imperial.hourly.temperature_2m[14])}°`
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

  it('formats sunrise and sunset with the location offset', () => {
    // Same assertions must hold under any process timezone; the formatter
    // only uses utc_offset_seconds.
    const v = buildWeatherView(imperial, 'Chicago', 'imperial', NOW)
    expect(v.sunriseLabel).toBe('5:15 AM')
    expect(v.sunsetLabel).toBe('8:28 PM')
  })

  it('applies a different offset', () => {
    const tokyo = { ...imperial, utc_offset_seconds: 32400 }
    const v = buildWeatherView(tokyo, 'Tokyo', 'imperial', NOW)
    // 10:15 UTC sunrise + 9h
    expect(v.sunriseLabel).toBe('7:15 PM')
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
