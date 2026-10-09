import { fetchForecast, Units } from './openMeteo.js'
import {
  buildWeatherView,
  ForecastResponse,
  noLocationView
} from './logic.js'
import {
  getWeatherSettings,
  setWeatherSettings,
  WeatherLocation,
  WeatherSettings
} from './settings.js'

import { WeatherView } from '../feeds/types.js'

export const WEATHER_INTERVAL = 15 * 60 * 1000

export interface WeatherFetcherDeps {
  getSettings: () => WeatherSettings
  getForecast: typeof fetchForecast
  now: () => number
}

export function createWeatherFetcher(
  deps: WeatherFetcherDeps = {
    getSettings: getWeatherSettings,
    getForecast: fetchForecast,
    now: () => Date.now()
  }
) {
  return async (): Promise<WeatherView[]> => {
    const { location, units } = deps.getSettings()
    // Not an error: the tab explains how to pick a location.
    if (!location) return [noLocationView()]

    const resp = (await deps.getForecast(
      location,
      units
    )) as ForecastResponse
    return [
      buildWeatherView(
        resp,
        location.name,
        units,
        Math.floor(deps.now() / 1000)
      )
    ]
  }
}

interface FeedControl {
  reset: () => void
  refetch: () => Promise<void>
}

// Saves the change, then drops the old forecast and fetches a new one, which
// the feed publishes to clients.
export function applyWeatherSettings(
  partial: Partial<{ location: WeatherLocation | null; units: Units }>,
  feed: FeedControl | null,
  save: typeof setWeatherSettings = setWeatherSettings
): WeatherSettings {
  const settings = save(partial)
  if (feed) {
    feed.reset()
    void feed.refetch()
  }
  return settings
}
