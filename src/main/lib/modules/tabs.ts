import { getStorageValue, setStorageValue } from '../storage.js'

import { FeedKey } from '../feeds/types.js'
import { ModuleManifest } from './types.js'
import { allModules } from './registry.js'
import { listConnectors } from '../connectors/store.js'
import {
  CONNECTOR_PREFIX,
  ConnectorDescriptor
} from '../connectors/types.js'

export interface TabSettings {
  order: string[]
  hidden: string[]
}

const STORAGE_KEY = 'tabSettings'

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []
}

export function normalizeTabSettings(
  value: unknown,
  ids: string[]
): TabSettings {
  const raw =
    value && typeof value === 'object'
      ? (value as Partial<TabSettings>)
      : {}
  const known = new Set(ids)
  const order = [
    ...new Set(strings(raw.order).filter(id => known.has(id)))
  ]
  for (const id of ids) if (!order.includes(id)) order.push(id)

  const wanted = new Set(strings(raw.hidden))
  const hidden = order.filter(id => wanted.has(id))
  return { order, hidden: hidden.length >= order.length ? [] : hidden }
}

const moduleIds = () => allModules().map(m => m.id)

export function getTabSettings(): TabSettings {
  return normalizeTabSettings(getStorageValue(STORAGE_KEY), moduleIds())
}

export interface TabsPayload extends TabSettings {
  connectors: ConnectorDescriptor[]
}

/** What the device gets in `tabs`: settings plus the connector descriptors
 * (id, label, layout only; never url, header or mapping). */
export function tabsPayload(): TabsPayload {
  return {
    ...getTabSettings(),
    connectors: listConnectors().map(c => ({
      id: `${CONNECTOR_PREFIX}${c.id}`,
      label: c.label,
      layout: c.layout
    }))
  }
}

export function setTabSettings(value: unknown): TabSettings {
  const settings = normalizeTabSettings(value, moduleIds())
  setStorageValue(STORAGE_KEY, settings)
  return settings
}

/** Feeds of visible modules plus everything they depend on. */
export function activeFeedKeys(
  manifests: ModuleManifest[],
  settings: TabSettings
): Set<FeedKey> {
  const byId = new Map(manifests.map(m => [m.id, m]))
  const hidden = new Set(settings.hidden)
  const queue = manifests.filter(m => !hidden.has(m.id)).map(m => m.id)
  const seen = new Set<string>()
  const keys = new Set<FeedKey>()
  while (queue.length) {
    const id = queue.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    const m = byId.get(id)
    if (!m) continue
    m.feedKeys.forEach(k => keys.add(k))
    queue.push(...(m.dependsOn ?? []))
  }
  return keys
}

export interface Startable {
  start(): void
  stop(): void
}

/** Starts newly active feeds, stops newly inactive ones. Returns the new running set. */
export function syncFeeds(
  feeds: Map<FeedKey, Startable>,
  running: Set<FeedKey>,
  active: Set<FeedKey>
): Set<FeedKey> {
  const next = new Set<FeedKey>()
  for (const [key, feed] of feeds) {
    const was = running.has(key)
    const now = active.has(key)
    if (now && !was) feed.start()
    else if (!now && was) feed.stop()
    if (now) next.add(key)
  }
  return next
}
