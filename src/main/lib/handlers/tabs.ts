import { tabsPayload } from '../modules/tabs.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'tabs'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  ws.send(
    JSON.stringify({
      type: 'tabs',
      data: tabsPayload()
    })
  )
}
