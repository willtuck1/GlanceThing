import { getDisplaySettings } from '../display.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'display'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  ws.send(
    JSON.stringify({
      type: 'display',
      data: getDisplaySettings()
    })
  )
}
