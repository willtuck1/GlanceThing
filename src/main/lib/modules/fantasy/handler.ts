import { respondWithFeed } from '../../feeds/respond.js'

import { HandlerFunction } from '../../../types/WebSocketHandler.js'

export const name = 'fantasy'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  respondWithFeed('fantasy', ws)
}
