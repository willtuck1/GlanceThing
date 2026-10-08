import { exec } from 'child_process'

import { getLockPlatformCommand } from '../utils.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'lock'

export const hasActions = false

export const handle: HandlerFunction = async () => {
  const command = getLockPlatformCommand()
  if (!command) return

  const { cmd, shell } = command

  exec(cmd, {
    shell
  })
}
