import { Feed } from '../feeds/Feed.js'
import { calendarFixture, todoFixture } from '../feeds/fixtures.js'
import {
  decoratePayload,
  FeedDecorator,
  registerFeed,
  unregisterAll
} from '../feeds/registry.js'
import { createSportsFetcher } from '../sports/espn.js'
import { getFavorites } from '../sports/favorites.js'
import { decorateSports, sportsInterval } from '../sports/logic.js'
import { getStorageValue, setStorageValue } from '../storage.js'
import { serverManager } from '../server.js'
import { formatDate } from '../time.js'
import { log, LogLevel } from '../utils.js'

import { FeedKey, FeedPayload, Game } from '../feeds/types.js'
import { SetupFunction } from '../../types/WebSocketSetup.js'

export const name = 'feeds'

const STUB_INTERVAL = 5 * 60 * 1000

interface CachedItems {
  items: unknown[]
  fetchedAt: number
}

function loadCache(key: string) {
  return getStorageValue(`feedCache.${key}`) as CachedItems | null
}

interface Source {
  key: FeedKey
  fetch: () => Promise<unknown[]>
  interval: (items: unknown[]) => number
  decorate?: FeedDecorator
}

function sources(): Source[] {
  const cachedGames = loadCache('sports')?.items
  const fetchSports = createSportsFetcher(
    undefined,
    Array.isArray(cachedGames) ? (cachedGames as Game[]) : []
  )

  return [
    // Calendar and To-do stay on fixtures until M2 and M3.
    {
      key: 'calendar',
      fetch: async () => calendarFixture,
      interval: () => STUB_INTERVAL
    },
    {
      key: 'todo',
      fetch: async () => todoFixture,
      interval: () => STUB_INTERVAL
    },
    {
      key: 'sports',
      fetch: fetchSports,
      interval: items => sportsInterval(items as Game[], Date.now()),
      decorate: payload =>
        decorateSports(payload as FeedPayload<Game>, getFavorites())
    }
  ]
}

export const setup: SetupFunction = async () => {
  const feeds = sources().map(({ key, fetch, interval, decorate }) => {
    const feed = new Feed<unknown>(
      { key, fetch, interval },
      {
        now: () => Date.now(),
        formatTime: ts => formatDate(new Date(ts)).time,
        loadCache,
        saveCache: (k, value) => setStorageValue(`feedCache.${k}`, value),
        publish: (k, payload) =>
          serverManager.broadcast(
            k,
            decoratePayload(k as FeedKey, payload as FeedPayload<unknown>)
          ),
        log: message => log(message, 'Feeds', LogLevel.WARN)
      }
    )
    registerFeed(key, feed, decorate)
    return feed
  })

  feeds.forEach(feed => feed.start())

  return async () => {
    feeds.forEach(feed => feed.stop())
    unregisterAll()
  }
}
