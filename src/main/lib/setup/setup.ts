import {
  CleanupFunction,
  SetupHandler
} from '../../types/WebSocketSetup.js'

import * as time from './time.js'
import * as playback from './playback.js'
import * as feeds from './feeds.js'
import * as agents from './agents.js'

const setupHandlers: SetupHandler[] = [time, playback, feeds, agents]

export async function runServerSetup() {
  const cleanupFunctions: CleanupFunction[] = []
  for (const handler of setupHandlers) {
    const cleanup = await handler.setup()
    cleanupFunctions.push(cleanup)
  }

  return async () => {
    for (const cleanup of cleanupFunctions) {
      await cleanup()
    }
  }
}
