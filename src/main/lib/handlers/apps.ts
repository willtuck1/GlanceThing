import { exec } from 'child_process'

import { getShortcutImage, getShortcuts } from '../shortcuts.js'
import { getParsedPlatformCommand } from '../utils.js'

import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'

export const name = 'apps'

export const hasActions = true

export const actions: HandlerAction[] = [
  {
    action: 'open',
    handle: async (_, data) => {
      const shortcuts = getShortcuts()
      const app = shortcuts.find(app => app.id === data)
      if (app) {
        const command = getParsedPlatformCommand(app.command)
        if (!command) return

        const { cmd, shell } = command

        exec(cmd, {
          shell
        })
      }
    }
  },
  {
    action: 'image',
    handle: async (ws, data) => {
      const res = getShortcutImage(data as string)
      if (!res) return

      ws.send(
        JSON.stringify({
          type: 'apps',
          action: 'image',
          data: {
            id: data,
            image: `data:image/jpeg;base64,${Buffer.from(res).toString(
              'base64'
            )}`
          }
        })
      )
    }
  }
]

export const handle: HandlerFunction = async ws => {
  const shortcuts = getShortcuts()
  ws.send(
    JSON.stringify({
      type: 'apps',
      data: shortcuts
    })
  )
}
