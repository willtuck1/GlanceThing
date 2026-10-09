import { getJson } from '../sports/espn.js'

export type Units = 'imperial' | 'metric'

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface LocationResult extends Coordinates {
  name: string
  label: string
}

export type Get = (url: string) => Promise<unknown>

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'

export function forecastUrl(loc: Coordinates, units: Units): string {
  const params = [
    `latitude=${loc.latitude}`,
    `longitude=${loc.longitude}`,
    'timezone=auto',
    'timeformat=unixtime',
    'current=temperature_2m,weather_code,is_day',
    'hourly=temperature_2m,precipitation_probability,precipitation',
    'daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,weather_code',
    'forecast_days=2',
    units === 'imperial'
      ? 'temperature_unit=fahrenheit&precipitation_unit=inch'
      : 'temperature_unit=celsius&precipitation_unit=mm'
  ]
  return `${FORECAST_URL}?${params.join('&')}`
}

export async function fetchForecast(
  loc: Coordinates,
  units: Units,
  get: Get = getJson
): Promise<unknown> {
  return get(forecastUrl(loc, units))
}

export async function searchLocations(
  query: string,
  get: Get = getJson
): Promise<LocationResult[]> {
  const name = query.trim()
  if (!name) return []

  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=8&language=en&format=json`
  const json = (await get(url)) as {
    results?: {
      name?: string
      admin1?: string
      country?: string
      latitude?: number
      longitude?: number
    }[]
  } | null

  const out: LocationResult[] = []
  for (const r of json?.results ?? []) {
    if (
      !r.name ||
      typeof r.latitude !== 'number' ||
      typeof r.longitude !== 'number'
    )
      continue
    out.push({
      name: r.name,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      latitude: r.latitude,
      longitude: r.longitude
    })
  }
  return out
}
