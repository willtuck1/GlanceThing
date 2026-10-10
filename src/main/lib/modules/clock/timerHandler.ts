import { getTimer } from '../../clock/instance.js'

import {
  HandlerAction,
  HandlerFunction
} from '../../../types/WebSocketHandler.js'

export const name = 'timer'

export const hasActions = true

/** A plain `{type:'timer'}` request: reply to that client only. */
export const handle: HandlerFunction = async ws => {
  ws.send(JSON.stringify({ type: 'timer', data: getTimer().payload() }))
}

export const actions: HandlerAction[] = [
  { action: 'start', handle: async (_ws, data) => getTimer().start(data) },
  { action: 'pause', handle: async () => getTimer().pause() },
  { action: 'resume', handle: async () => getTimer().resume() },
  { action: 'reset', handle: async () => getTimer().reset() },
  { action: 'dismiss', handle: async () => getTimer().dismiss() }
]
