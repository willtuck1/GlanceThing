import { describeFetchError, FeedError } from '../feeds/errors.js'
import { Feed } from '../feeds/Feed.js'
import {
  decoratePayload,
  FeedDecorator,
  getFeed,
  getFeedPayload,
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
import { describeGoogleError } from '../google/session.js'
import { getSelectedTaskList } from '../google/tasksSettings.js'
import { decorateFantasy } from '../fantasy/gameStatus.js'
import { fantasyInterval } from '../fantasy/logic.js'
import { getPlayers } from '../fantasy/playersDisk.js'
import { afterPublish, sportsSnapshot } from '../fantasy/sportsLink.js'
import {
  createProjectionStore,
  projectionsGet
} from '../fantasy/projections.js'
import {
  getFantasySettings,
  setFantasyUserId
} from '../fantasy/settings.js'
import {
  createFantasyFetcher,
  describeFantasyError,
  sleeperGet
} from '../fantasy/sleeper.js'
import { createSportsFetcher } from '../sports/espn.js'
import { getFavorites } from '../sports/favorites.js'
import { decorateSports, sportsInterval } from '../sports/logic.js'
import {
  createWeatherFetcher,
  WEATHER_INTERVAL
} from '../weather/service.js'
import { getStorageValue, setStorageValue } from '../storage.js'
import { serverManager } from '../server.js'
import { formatDate } from '../time.js'
import { log, LogLevel } from '../utils.js'

import { FantasyView, FeedKey, FeedPayload, Game } from '../feeds/types.js'
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
  describeError: (e: unknown) => FeedError
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
      interval: () => CALENDAR_INTERVAL,
      describeError: describeGoogleError
    },
    {
      key: 'todo',
      fetch: createTasksFetcher({
        get: googleGet,
        getSelected: getSelectedTaskList,
        now: () => Date.now()
      }),
      interval: () => TASKS_INTERVAL,
      describeError: describeGoogleError
    },
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
    },
    {
      key: 'fantasy',
      fetch: createFantasyFetcher({
        get: sleeperGet,
        getSettings: getFantasySettings,
        saveUserId: setFantasyUserId,
        getPlayers,
        getProjections: createProjectionStore({
          get: projectionsGet,
          now: () => Date.now(),
          log: message => log(message, 'Fantasy', LogLevel.WARN)
        })
      }),
      // Fast while an NFL game is live, judged from the Sports feed's games.
      interval: () =>
        fantasyInterval(
          (getFeed('sports')?.getPayload().items ?? []) as Game[],
          Date.now()
        ),
      describeError: describeFantasyError,
      // Game status and the estimate come from the Sports feed's ESPN data.
      decorate: payload =>
        decorateFantasy(
          payload as FeedPayload<FantasyView>,
          sportsSnapshot(getFeed('sports')),
          { formatTime: ts => formatDate(new Date(ts)).time }
        )
    },
    {
      key: 'weather',
      fetch: createWeatherFetcher(),
      interval: () => WEATHER_INTERVAL,
      describeError: e => describeFetchError(e, 'Open-Meteo')
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
  // Same for a fantasy matchup cached before the username was removed.
  if (!getFantasySettings().username)
    setStorageValue('feedCache.fantasy', null)

  const feeds = sources().map(({ decorate, ...options }) => {
    const feed = new Feed<unknown>(options, {
      now: () => Date.now(),
      formatTime: ts => formatDate(new Date(ts)).time,
      loadCache,
      saveCache: (k, value) => setStorageValue(`feedCache.${k}`, value),
      publish: (k, payload) => {
        serverManager.broadcast(
          k,
          decoratePayload(k as FeedKey, payload as FeedPayload<unknown>)
        )
        afterPublish(k, {
          getFantasyPayload: () =>
            getFeedPayload('fantasy') as FeedPayload<FantasyView> | null,
          broadcast: (type, data) => serverManager.broadcast(type, data)
        })
      },
      log: message => log(message, 'Feeds', LogLevel.WARN)
    })
    registerFeed(options.key, feed, decorate)
    return feed
  })

  feeds.forEach(feed => feed.start())

  return async () => {
    feeds.forEach(feed => feed.stop())
    unregisterAll()
  }
}
