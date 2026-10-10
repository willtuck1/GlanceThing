import { createHash } from 'node:crypto'

import { Feed } from '../feeds/Feed.js'
import {
  decoratePayload,
  getFeedPayload,
  registerFeed,
  unregisterAll,
  unregisterFeed
} from '../feeds/registry.js'
import { afterPublish } from '../fantasy/sportsLink.js'
import { connectorKey, connectorManifest } from '../connectors/modules.js'
import {
  getConnectorSecret,
  listConnectors,
  onConnectorsChanged
} from '../connectors/store.js'
import { CONNECTOR_PREFIX, Connector } from '../connectors/types.js'
import { loadCache } from '../modules/cache.js'
import { allModules } from '../modules/registry.js'
import {
  activeFeedKeys,
  getTabSettings,
  syncFeeds,
  TabSettings,
  tabsPayload
} from '../modules/tabs.js'
import { FeedSource } from '../modules/types.js'
import { deleteStorageValue, setStorageValue } from '../storage.js'
import { serverManager } from '../server.js'
import { formatDate } from '../time.js'
import { log, LogLevel } from '../utils.js'

import { FantasyView, FeedKey, FeedPayload } from '../feeds/types.js'
import { SetupFunction } from '../../types/WebSocketSetup.js'

export const name = 'feeds'

const registered = new Map<FeedKey, Feed<unknown>>()
let running = new Set<FeedKey>()
// What each connector feed was built from, to tell edits apart.
const connectorState = new Map<
  FeedKey,
  { content: string; interval: number }
>()

export function applyTabSettings(settings: TabSettings) {
  running = syncFeeds(
    registered,
    running,
    activeFeedKeys(allModules(), settings)
  )
}

function createFeed({
  key,
  fetch,
  interval,
  describeError,
  decorate
}: FeedSource) {
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
  registerFeed(key, feed, decorate)
  registered.set(key, feed)
  return feed
}

// Everything that changes what a connector fetches or shows. The secret is
// only hashed, in memory.
function contentOf(c: Connector) {
  const secret = getConnectorSecret(c.id)
  return JSON.stringify([
    c.source.url,
    c.source.header?.name ?? null,
    secret ? createHash('sha256').update(secret).digest('hex') : null,
    c.layout,
    c.mapping
  ])
}

function removeConnectorFeed(key: FeedKey) {
  registered.get(key)?.dispose()
  registered.delete(key)
  running.delete(key)
  connectorState.delete(key)
  unregisterFeed(key)
  deleteStorageValue(`feedCache.${key}`)
}

/**
 * Brings the `json:*` feeds in line with the stored connectors: adds new
 * ones, replaces edited ones, removes deleted ones, then re-applies the tab
 * settings and tells the clients. A visible new or edited connector fetches
 * right away (starting a feed fetches).
 */
export function reconcileConnectors() {
  const connectors = listConnectors()
  const wanted = new Set(connectors.map(c => connectorKey(c.id)))

  for (const key of [...registered.keys()])
    if (key.startsWith(CONNECTOR_PREFIX) && !wanted.has(key))
      removeConnectorFeed(key)

  for (const c of connectors) {
    const key = connectorKey(c.id)
    const content = contentOf(c)
    const interval = c.intervalMin * 60_000
    const previous = connectorState.get(key)
    if (previous?.content === content && previous.interval === interval)
      continue

    const had = registered.has(key)
    registered.get(key)?.dispose()
    running.delete(key)
    // Data from the old url or mapping must not show under the new one.
    if (had && previous?.content !== content)
      deleteStorageValue(`feedCache.${key}`)
    connectorState.set(key, { content, interval })
    const [source] = connectorManifest(c).feeds()
    createFeed(source)
  }

  const settings = getTabSettings()
  applyTabSettings(settings)
  serverManager.broadcast('tabs', tabsPayload())
}

export const setup: SetupFunction = async () => {
  const sources = allModules().flatMap(m => m.feeds())
  sources.forEach(source => source.prepare?.())

  const feeds = sources.map(source => createFeed(source))

  // Feeds built above for connectors are current, so record them.
  connectorState.clear()
  for (const c of listConnectors()) {
    const key = connectorKey(c.id)
    if (!registered.has(key)) continue
    connectorState.set(key, {
      content: contentOf(c),
      interval: c.intervalMin * 60_000
    })
  }

  running = new Set()
  applyTabSettings(getTabSettings())
  const unsubscribe = onConnectorsChanged(() => reconcileConnectors())

  return async () => {
    unsubscribe()
    feeds.forEach(feed => feed.stop())
    registered.forEach(feed => feed.stop())
    registered.clear()
    connectorState.clear()
    running = new Set()
    unregisterAll()
  }
}
