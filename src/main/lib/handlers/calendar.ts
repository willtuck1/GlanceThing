import { respondWithFeed } from '../feeds/respond.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'calendar'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  respondWithFeed('calendar', ws)
}
