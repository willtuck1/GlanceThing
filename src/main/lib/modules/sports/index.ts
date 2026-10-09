import { describeFetchError } from '../../feeds/errors.js'
import { FeedPayload, Game } from '../../feeds/types.js'
import { createSportsFetcher } from '../../sports/espn.js'
import { getFavorites } from '../../sports/favorites.js'
import { decorateSports, sportsInterval } from '../../sports/logic.js'
import { formatDate } from '../../time.js'
import { loadCache } from '../cache.js'
import { ModuleManifest } from '../types.js'

import * as handler from './handler.js'

export const manifest: ModuleManifest = {
  id: 'sports',
  label: 'Sports',
  feeds: () => {
    const cachedGames = loadCache('sports')?.items
    const fetchSports = createSportsFetcher(
      undefined,
      Array.isArray(cachedGames) ? (cachedGames as Game[]) : []
    )
    return [
      {
        key: 'sports',
        fetch: fetchSports,
        interval: items => sportsInterval(items as Game[], Date.now()),
        describeError: e => describeFetchError(e, 'ESPN'),
        decorate: payload =>
          decorateSports(payload as FeedPayload<Game>, getFavorites(), {
            now: Date.now(),
            formatTime: ts => formatDate(new Date(ts)).time
          })
      }
    ]
  },
  handlers: [handler]
}
