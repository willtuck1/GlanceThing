import { respondWithFeed } from '../feeds/respond.js'

import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'

export const name = 'todo'

export const hasActions = true

export const handle: HandlerFunction = async ws => {
  respondWithFeed('todo', ws)
}

// Stub until M3: acknowledges every toggle without touching any data.
export const actions: HandlerAction[] = [
  {
    action: 'toggle',
    handle: async (ws, data) => {
      const reqId = (data as { reqId?: string } | null)?.reqId
      ws.send(
        JSON.stringify({
          type: 'todo',
          action: 'ack',
          data: { reqId, ok: true }
        })
      )
    }
  }
]
