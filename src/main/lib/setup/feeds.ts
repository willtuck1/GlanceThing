import { Feed } from '../feeds/Feed.js'
import {
  decoratePayload,
  getFeedPayload,
  registerFeed,
  unregisterAll
} from '../feeds/registry.js'
import { afterPublish } from '../fantasy/sportsLink.js'
import { loadCache } from '../modules/cache.js'
import { modules } from '../modules/registry.js'
import {
  activeFeedKeys,
  getTabSettings,
  Startable,
  syncFeeds,
  TabSettings
} from '../modules/tabs.js'
import { setStorageValue } from '../storage.js'
import { serverManager } from '../server.js'
import { formatDate } from '../time.js'
import { log, LogLevel } from '../utils.js'

import { FantasyView, FeedKey, FeedPayload } from '../feeds/types.js'
import { SetupFunction } from '../../types/WebSocketSetup.js'

export const name = 'feeds'

const registered = new Map<FeedKey, Startable>()
let running = new Set<FeedKey>()

export function applyTabSettings(settings: TabSettings) {
  running = syncFeeds(
    registered,
    running,
    activeFeedKeys(modules, settings)
  )
}

export const setup: SetupFunction = async () => {
  const sources = modules.flatMap(m => m.feeds())
  sources.forEach(source => source.prepare?.())

  const feeds = sources.map(
    ({ key, fetch, interval, describeError, decorate }) => {
      const options = { key, fetch, interval, describeError }
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
      registered.set(options.key as FeedKey, feed)
      return feed
    }
  )

  running = new Set()
  applyTabSettings(getTabSettings())

  return async () => {
    feeds.forEach(feed => feed.stop())
    registered.clear()
    running = new Set()
    unregisterAll()
  }
}
