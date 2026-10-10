import { clockPayload } from '../../clock/settings.js'

import { HandlerFunction } from '../../../types/WebSocketHandler.js'

export const name = 'clock'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  ws.send(JSON.stringify({ type: 'clock', data: clockPayload() }))
}
