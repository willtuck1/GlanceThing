import { HandlerFunction } from '../../types/WebSocketHandler.js'
import { clockSync } from '../time.js'

export const name = 'time'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  ws.send(
    JSON.stringify({
      type: 'time',
      data: clockSync()
    })
  )
}
