import { respondWithFeed } from '../feeds/respond.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'weather'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  respondWithFeed('weather', ws)
}
