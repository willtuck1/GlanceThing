import { Feed } from '../feeds/Feed.js'
import {
  decoratePayload,
  FeedDecorator,
  registerFeed,
  unregisterAll
} from '../feeds/registry.js'
import { getGoogleStatus } from '../google/auth.js'
import { createCalendarFetcher } from '../google/calendar.js'
import {
  getSelectedCalendars,
  googleGet
} from '../google/calendarSettings.js'
import { CALENDAR_INTERVAL } from '../google/calendarLogic.js'
import { createTasksFetcher } from '../google/tasks.js'
import { TASKS_INTERVAL } from '../google/tasksLogic.js'
import { getSelectedTaskList } from '../google/tasksSettings.js'
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
    {
      key: 'calendar',
      fetch: createCalendarFetcher({
        get: googleGet,
        getSelected: getSelectedCalendars,
        now: () => Date.now(),
        formatTime: ts => formatDate(new Date(ts)).time
      }),
      interval: () => CALENDAR_INTERVAL
    },
    {
      key: 'todo',
      fetch: createTasksFetcher({
        get: googleGet,
        getSelected: getSelectedTaskList,
        now: () => Date.now()
      }),
      interval: () => TASKS_INTERVAL
    },
    {
      key: 'sports',
      fetch: fetchSports,
      interval: items => sportsInterval(items as Game[], Date.now()),
      decorate: payload =>
        decorateSports(payload as FeedPayload<Game>, getFavorites(), {
          now: Date.now(),
          formatTime: ts => formatDate(new Date(ts)).time
        })
    }
  ]
}

export const setup: SetupFunction = async () => {
  // Without a Google account, don't show events or tasks cached from an
  // earlier account (or from the M0 fixtures).
  if (!getGoogleStatus().connected) {
    setStorageValue('feedCache.calendar', null)
    setStorageValue('feedCache.todo', null)
  }

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
