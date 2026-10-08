import { getFeed } from './registry.js'

import { FeedKey } from './types.js'
import { AuthenticatedWebSocket } from '../../types/WebSocketServer.js'

export function respondWithFeed(
  key: FeedKey,
  ws: AuthenticatedWebSocket
) {
  const feed = getFeed(key)
  if (!feed) return

  ws.send(JSON.stringify({ type: key, data: feed.getPayload() }))
  feed.requestRefresh()
}
