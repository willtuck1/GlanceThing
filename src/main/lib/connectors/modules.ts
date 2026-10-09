// Turns a stored connector into a runtime module (`json:<id>`). Logs nothing;
// errors shown to the device never include the URL or the secret.

import { FeedError } from '../feeds/errors.js'
import { respondWithFeed } from '../feeds/respond.js'
import { FeedKey } from '../feeds/types.js'
import { ModuleManifest } from '../modules/types.js'
import { HandlerFunction } from '../../types/WebSocketHandler.js'

import { fetchConnectorJson } from './fetch.js'
import { applyMapping } from './mapping.js'
import { getConnector, getConnectorSecret } from './store.js'
import { Connector, CONNECTOR_PREFIX } from './types.js'

export function connectorKey(id: string): FeedKey {
  return `${CONNECTOR_PREFIX}${id}`
}

function describeError(e: unknown): FeedError {
  // ConnectorFetchError and mapping errors carry short readable messages.
  const message =
    e instanceof Error && e.message ? e.message : 'Fetch failed'
  return { message, dropItems: false }
}

export function connectorManifest(c: Connector): ModuleManifest {
  const key = connectorKey(c.id)
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
          const name = current.source.header?.name
          const value = name ? getConnectorSecret(c.id) : null
          const data = await fetchConnectorJson(current.source.url, {
            header: name && value ? { name, value } : undefined
          })
          return [applyMapping(current.layout, current.mapping, data)]
        },
        interval: () => c.intervalMin * 60_000,
        describeError
      }
    ],
    handlers: [{ name: key, hasActions: false, handle }]
  }
}
