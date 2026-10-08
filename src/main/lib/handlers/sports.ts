import { respondWithFeed } from '../feeds/respond.js'

import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'

export const name = 'sports'

export const hasActions = true

export const handle: HandlerFunction = async ws => {
  respondWithFeed('sports', ws)
}

// Stub until M1: favorites are not persisted yet.
export const actions: HandlerAction[] = [
  {
    action: 'favorite',
    handle: async ws => {
      respondWithFeed('sports', ws)
    }
  }
]
