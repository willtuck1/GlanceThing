import { getAgentStore } from '../../agents/instance.js'

import { HandlerFunction } from '../../../types/WebSocketHandler.js'

export const name = 'agents'

export const hasActions = false

/** A plain `{type:'agents'}` request: reply to that client only. */
export const handle: HandlerFunction = async ws => {
  ws.send(JSON.stringify({ type: 'agents', data: getAgentStore().payload() }))
}
