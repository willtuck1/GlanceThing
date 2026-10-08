import { respondWithFeed } from '../feeds/respond.js'
import { getFeedPayload } from '../feeds/registry.js'
import { setStoredFavorite } from '../sports/favorites.js'
import { isTeamKey } from '../sports/logic.js'
import { serverManager } from '../server.js'
import { log, LogLevel } from '../utils.js'

import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'

export const name = 'sports'

export const hasActions = true

export const handle: HandlerFunction = async ws => {
  respondWithFeed('sports', ws)
}

export const actions: HandlerAction[] = [
  {
    action: 'favorite',
    handle: async (_ws, data) => {
      const { teamKey, on } =
        (data as { teamKey?: unknown; on?: unknown } | null) ?? {}
      if (!isTeamKey(teamKey)) {
        log('Ignoring invalid team key', 'Sports', LogLevel.WARN)
        return
      }

      // `on` sets the exact state, so repeats are harmless. Without it the
      // action toggles, as in the original protocol.
      setStoredFavorite(teamKey, typeof on === 'boolean' ? on : undefined)

      // Every client sees the new order and stars, not just the sender.
      const payload = getFeedPayload('sports')
      if (payload) serverManager.broadcast('sports', payload)
    }
  }
]
