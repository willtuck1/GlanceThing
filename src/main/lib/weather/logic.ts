import { WeatherView } from '../feeds/types.js'

import { Units } from './openMeteo.js'

type Forecast = Extract<WeatherView, { kind: 'forecast' }>

export interface ForecastResponse {
  utc_offset_seconds: number
  timezone?: string
  current: { temperature_2m: number; weather_code: number; is_day: number }
  hourly: {
    time: number[]
    temperature_2m: (number | null)[]
    precipitation_probability: (number | null)[]
  }
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    sunrise: number[]
    sunset: number[]
    precipitation_sum: number[]
  }
}

const HOURS = 12

// WMO weather codes. Icons: clear, partly, cloudy, fog, drizzle, rain, snow,
// storm; clear and partly get a '-night' variant when it is dark.
const CODES: Record<number, { label: string; icon: string }> = {
  0: { label: 'Clear', icon: 'clear' },
  1: { label: 'Mostly clear', icon: 'clear' },
  2: { label: 'Partly cloudy', icon: 'partly' },
  3: { label: 'Overcast', icon: 'cloudy' },
  45: { label: 'Fog', icon: 'fog' },
  48: { label: 'Freezing fog', icon: 'fog' },
  51: { label: 'Light drizzle', icon: 'drizzle' },
  53: { label: 'Drizzle', icon: 'drizzle' },
  55: { label: 'Heavy drizzle', icon: 'drizzle' },
  56: { label: 'Freezing drizzle', icon: 'drizzle' },
  57: { label: 'Freezing drizzle', icon: 'drizzle' },
  61: { label: 'Light rain', icon: 'rain' },
  63: { label: 'Rain', icon: 'rain' },
  65: { label: 'Heavy rain', icon: 'rain' },
  66: { label: 'Freezing rain', icon: 'rain' },
  67: { label: 'Freezing rain', icon: 'rain' },
  71: { label: 'Light snow', icon: 'snow' },
  73: { label: 'Snow', icon: 'snow' },
  75: { label: 'Heavy snow', icon: 'snow' },
  77: { label: 'Snow grains', icon: 'snow' },
  80: { label: 'Light showers', icon: 'rain' },
  81: { label: 'Showers', icon: 'rain' },
  82: { label: 'Heavy showers', icon: 'rain' },
  85: { label: 'Snow showers', icon: 'snow' },
  86: { label: 'Heavy snow showers', icon: 'snow' },
  95: { label: 'Thunderstorm', icon: 'storm' },
  96: { label: 'Thunderstorm with hail', icon: 'storm' },
  99: { label: 'Thunderstorm with hail', icon: 'storm' }
}

export function describeCode(
  code: number,
  isDay: boolean
): { label: string; icon: string } {
  const found = CODES[code]
  if (!found) return { label: 'Unknown', icon: 'cloudy' }
  const night =
    !isDay && (found.icon === 'clear' || found.icon === 'partly')
  return {
    label: found.label,
    icon: night ? `${found.icon}-night` : found.icon
  }
}

const formatters = new Map<string, Intl.DateTimeFormat | null>()

function formatterFor(timezone: string | undefined) {
  if (!timezone) return null
  let f = formatters.get(timezone)
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        hour: 'numeric',
        minute: 'numeric'
      })
    } catch {
      f = null
    }
    formatters.set(timezone, f)
  }
  return f
}

// Wall-clock hour and minute at the location. Uses the IANA timezone so
// daylight saving changes inside the forecast window are right; falls back to
// the fixed UTC offset if the zone is missing or unknown. Never uses the
// desktop timezone.
function parts(sec: number, offset: number, timezone?: string) {
  const f = formatterFor(timezone)
  if (f) {
    const p = f.formatToParts(new Date(sec * 1000))
    const num = (type: string) =>
      Number(p.find(x => x.type === type)?.value)
    // Some ICU versions render midnight as 24 even with h23.
    return { h: num('hour') % 24, m: num('minute') }
  }
  const local = new Date((sec + offset) * 1000)
  return { h: local.getUTCHours(), m: local.getUTCMinutes() }
}

function clock(h: number): { h12: number; ampm: string } {
  return { h12: h % 12 === 0 ? 12 : h % 12, ampm: h < 12 ? 'AM' : 'PM' }
}

export function formatClock(
  sec: number,
  offset: number,
  timezone?: string
): string {
  const { h, m } = parts(sec, offset, timezone)
  const { h12, ampm } = clock(h)
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function formatHour(
  sec: number,
  offset: number,
  timezone?: string
): string {
  const { h12, ampm } = clock(parts(sec, offset, timezone).h)
  return `${h12} ${ampm}`
}

function deg(value: number): string {
  return `${Math.round(value)}°`
}

export function noLocationView(): WeatherView {
  return { kind: 'none', message: 'Set a location in Settings' }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function firstIsNum(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && isNum(v[0])
}

function nonEmpty(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0
}

// Throws on a response that would render as NaN, so the Feed goes stale.
function assertForecast(resp: ForecastResponse): void {
  const { current, hourly, daily } = resp ?? ({} as ForecastResponse)
  if (
    !isNum(current?.temperature_2m) ||
    !isNum(current?.weather_code) ||
    !isNum(resp.utc_offset_seconds) ||
    !nonEmpty(hourly?.time) ||
    !nonEmpty(hourly?.temperature_2m) ||
    !firstIsNum(daily?.temperature_2m_max) ||
    !firstIsNum(daily?.temperature_2m_min) ||
    !firstIsNum(daily?.sunrise) ||
    !firstIsNum(daily?.sunset) ||
    !firstIsNum(daily?.precipitation_sum)
  )
    throw new Error('Unexpected Open-Meteo response')
}

export function buildWeatherView(
  resp: ForecastResponse,
  location: string,
  units: Units,
  nowSec: number
): Forecast {
  assertForecast(resp)
  const offset = resp.utc_offset_seconds
  const tz = resp.timezone
  const { current, hourly, daily } = resp

  let start = 0
  hourly.time.forEach((t, i) => {
    if (t <= nowSec) start = i
  })

  // Hours with no temperature are skipped, not shown as 0°.
  const hours: Forecast['hours'] = []
  for (
    let i = start;
    i < hourly.time.length && hours.length < HOURS;
    i++
  ) {
    const temp = hourly.temperature_2m[i]
    if (!isNum(temp)) continue
    hours.push({
      timeLabel:
        i === start ? 'Now' : formatHour(hourly.time[i], offset, tz),
      tempLabel: deg(temp),
      precipPct: hourly.precipitation_probability?.[i] ?? 0
    })
  }

  const { label, icon } = describeCode(
    current.weather_code,
    current.is_day === 1
  )

  return {
    kind: 'forecast',
    locationName: location,
    units,
    current: {
      tempLabel: `${Math.round(current.temperature_2m)}°${units === 'imperial' ? 'F' : 'C'}`,
      code: current.weather_code,
      label,
      icon
    },
    highLabel: deg(daily.temperature_2m_max[0]),
    lowLabel: deg(daily.temperature_2m_min[0]),
    sunriseLabel: formatClock(daily.sunrise[0], offset, tz),
    sunsetLabel: formatClock(daily.sunset[0], offset, tz),
    precipLabel:
      units === 'imperial'
        ? `${daily.precipitation_sum[0].toFixed(2)} in`
        : `${daily.precipitation_sum[0].toFixed(1)} mm`,
    hours
  }
}
