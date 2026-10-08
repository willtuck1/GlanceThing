import { Feed } from '../feeds/Feed.js'
import {
  calendarFixture,
  sportsFixture,
  todoFixture
} from '../feeds/fixtures.js'
import { registerFeed, unregisterAll } from '../feeds/registry.js'
import { getStorageValue, setStorageValue } from '../storage.js'
import { serverManager } from '../server.js'
import { formatDate } from '../time.js'
import { log, LogLevel } from '../utils.js'

import { FeedKey } from '../feeds/types.js'
import { SetupFunction } from '../../types/WebSocketSetup.js'

export const name = 'feeds'

const STUB_INTERVAL = 5 * 60 * 1000

// M0 stubs: each feed serves fixture data until the real sources land.
const sources: { key: FeedKey; items: unknown[] }[] = [
  { key: 'calendar', items: calendarFixture },
  { key: 'todo', items: todoFixture },
  { key: 'sports', items: sportsFixture }
]

export const setup: SetupFunction = async () => {
  const feeds = sources.map(({ key, items }) => {
    const feed = new Feed<unknown>(
      {
        key,
        fetch: async () => items,
        interval: () => STUB_INTERVAL
      },
      {
        now: () => Date.now(),
        formatTime: ts => formatDate(new Date(ts)).time,
        loadCache: k => {
          const value = getStorageValue(`feedCache.${k}`)
          return value as { items: unknown[]; fetchedAt: number } | null
        },
        saveCache: (k, value) => setStorageValue(`feedCache.${k}`, value),
        publish: (k, payload) => serverManager.broadcast(k, payload),
        log: message => log(message, 'Feeds', LogLevel.WARN)
      }
    )
    registerFeed(key, feed)
    return feed
  })

  feeds.forEach(feed => feed.start())

  return async () => {
    feeds.forEach(feed => feed.stop())
    unregisterAll()
  }
}
