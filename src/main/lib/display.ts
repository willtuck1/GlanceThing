import { getStorageValue, setStorageValue } from './storage.js'

export interface DisplaySettings {
  sportsTintOpacity: number
  calendarTintOpacity: number
}

export const DISPLAY_DEFAULTS: DisplaySettings = {
  sportsTintOpacity: 25,
  calendarTintOpacity: 45
}

const KEYS = Object.keys(DISPLAY_DEFAULTS) as (keyof DisplaySettings)[]

function normalize(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function getDisplaySettings(): DisplaySettings {
  return {
    sportsTintOpacity: normalize(
      getStorageValue('sportsTintOpacity'),
      DISPLAY_DEFAULTS.sportsTintOpacity
    ),
    calendarTintOpacity: normalize(
      getStorageValue('calendarTintOpacity'),
      DISPLAY_DEFAULTS.calendarTintOpacity
    )
  }
}

export function setDisplaySettings(
  partial: Partial<DisplaySettings>
): DisplaySettings {
  for (const key of KEYS) {
    const value = partial?.[key]
    if (value === undefined) continue
    setStorageValue(key, normalize(value, DISPLAY_DEFAULTS[key]))
  }
  return getDisplaySettings()
}
