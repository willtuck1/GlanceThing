import { FeedError } from '../feeds/errors.js'
import { FeedDecorator } from '../feeds/registry.js'
import { FeedKey } from '../feeds/types.js'
import { Handler } from '../../types/WebSocketHandler.js'

export interface FeedSource {
  key: FeedKey
  fetch: () => Promise<unknown[]>
  interval: (items: unknown[]) => number
  describeError: (e: unknown) => FeedError
  decorate?: FeedDecorator
  /** Runs before the feed is created. */
  prepare?: () => void
}

export interface ModuleManifest {
  id: string
  label: string
  /** Keys of the feeds `feeds()` builds, known without building them. */
  feedKeys: FeedKey[]
  /** A function because some sources read the cache at setup time. */
  feeds: () => FeedSource[]
  handlers: Handler[]
  dependsOn?: string[]
  settings?: { panel: 'google' | 'fantasy' | 'weather' }
}
