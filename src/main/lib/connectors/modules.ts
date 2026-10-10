// Turns a stored connector into a runtime module (`json:<id>`). Logs nothing;
// errors shown to the device never include the URL or the secret.

import { FeedError } from '../feeds/errors.js'
import { respondWithFeed } from '../feeds/respond.js'
import { FeedKey } from '../feeds/types.js'
import { ModuleManifest } from '../modules/types.js'
import { HandlerFunction } from '../../types/WebSocketHandler.js'

import { fetchConnectorJson } from './fetch.js'
import { applyMapping } from './mapping.js'
import {
  assertNoSecret,
  getConnector,
  getConnectorSecret
} from './store.js'
import { runMcpConnector } from './mcpHook.js'
import { Connector, connectorModuleId } from './types.js'

export function connectorKey(c: Connector): FeedKey {
  return connectorModuleId(c) as FeedKey
}

function describeError(e: unknown): FeedError {
  // ConnectorFetchError and mapping errors carry short readable messages.
  const message =
    e instanceof Error && e.message ? e.message : 'Fetch failed'
  return { message, dropItems: false }
}

export function connectorManifest(c: Connector): ModuleManifest {
  const key = connectorKey(c)
  const handle: HandlerFunction = async ws => {
    respondWithFeed(key, ws)
  }
  return {
    id: key,
    label: c.label,
    feedKeys: [key],
    feeds: () => [
      {
        key,
        // Read at fetch time so an edit applies to the next fetch.
        fetch: async () => {
          const current = getConnector(c.id)
          if (!current) throw new Error('Connector was removed')
          if (current.source.kind === 'mcp') {
            return [await runMcpConnector(current)]
          }
          const name = current.source.header?.name
          const value = name ? getConnectorSecret(c.id) : null
          const data = await fetchConnectorJson(current.source.url, {
            header: name && value ? { name, value } : undefined
          })
          const view = applyMapping(current.layout, current.mapping, data)
          assertNoSecret(view, value)
          return [view]
        },
        interval: () => c.intervalMin * 60_000,
        describeError
      }
    ],
    handlers: [{ name: key, hasActions: false, handle }]
  }
}
