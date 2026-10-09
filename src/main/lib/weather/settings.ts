import { getStorageValue, setStorageValue } from '../storage.js'

import { Units } from './openMeteo.js'

export interface WeatherLocation {
  name: string
  latitude: number
  longitude: number
}

export interface WeatherSettings {
  location: WeatherLocation | null
  units: Units
}

function normalizeLocation(value: unknown): WeatherLocation | null {
  if (!value || typeof value !== 'object') return null
  const { name, latitude, longitude } = value as Record<string, unknown>
  if (typeof name !== 'string' || !name.trim()) return null
  if (typeof latitude !== 'number' || !Number.isFinite(latitude))
    return null
  if (typeof longitude !== 'number' || !Number.isFinite(longitude))
    return null
  if (latitude < -90 || latitude > 90) return null
  if (longitude < -180 || longitude > 180) return null
  return { name: name.trim(), latitude, longitude }
}

function normalizeUnits(value: unknown): Units {
  return value === 'metric' ? 'metric' : 'imperial'
}

export function getWeatherSettings(): WeatherSettings {
  return {
    location: normalizeLocation(getStorageValue('weatherLocation')),
    units: normalizeUnits(getStorageValue('weatherUnits'))
  }
}

// Validates everything before storing anything, so a bad call changes
// nothing. An explicit `location: null` clears the saved location.
export function setWeatherSettings(
  partial: Partial<{ location: WeatherLocation | null; units: Units }>
): WeatherSettings {
  let location: WeatherLocation | null | undefined
  if (partial?.location !== undefined) {
    location =
      partial.location === null
        ? null
        : normalizeLocation(partial.location)
    if (location === null && partial.location !== null)
      throw new Error('Invalid location')
  }
  if (
    partial?.units !== undefined &&
    partial.units !== 'imperial' &&
    partial.units !== 'metric'
  )
    throw new Error('Invalid units')

  if (location !== undefined) setStorageValue('weatherLocation', location)
  if (partial?.units !== undefined)
    setStorageValue('weatherUnits', partial.units)
  return getWeatherSettings()
}
