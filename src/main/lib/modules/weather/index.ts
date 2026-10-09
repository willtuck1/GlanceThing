import { describeFetchError } from '../../feeds/errors.js'
import {
  createWeatherFetcher,
  WEATHER_INTERVAL
} from '../../weather/service.js'
import { ModuleManifest } from '../types.js'

import * as handler from './handler.js'

export const manifest: ModuleManifest = {
  id: 'weather',
  label: 'Weather',
  feeds: () => [
    {
      key: 'weather',
      fetch: createWeatherFetcher(),
      interval: () => WEATHER_INTERVAL,
      describeError: e => describeFetchError(e, 'Open-Meteo')
    }
  ],
  handlers: [handler],
  settings: { panel: 'weather' }
}
