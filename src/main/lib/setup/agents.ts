import { startAgentsListener } from '../agents/listener.js'
import { adapters } from '../agents/adapters/registry.js'
import { getAgentsToken } from '../agents/token.js'
import { ingestStatus, startSweep, stopSweep } from '../agents/instance.js'

import { SetupFunction } from '../../types/WebSocketSetup.js'

export const name = 'agents'

export const AGENTS_DEFAULT_PORT = 47816
const MAX_TRIES = 10

export interface ListenerStatus {
  running: boolean
  port: number | null
  error?: string
}

let status: ListenerStatus = { running: false, port: null }

export function getListenerStatus(): ListenerStatus {
  return { ...status }
}

export const setup: SetupFunction = async () => {
  let listener: Awaited<ReturnType<typeof startAgentsListener>> | null = null
  try {
    listener = await startAgentsListener({
      port: AGENTS_DEFAULT_PORT,
      maxTries: MAX_TRIES,
      token: getAgentsToken,
      adapters: () => adapters,
      onStatus: ingestStatus
    })
    status = { running: true, port: listener.port }
  } catch {
    status = {
      running: false,
      port: null,
      error: `Could not start on ports ${AGENTS_DEFAULT_PORT}–${AGENTS_DEFAULT_PORT + MAX_TRIES - 1}`
    }
  }
  startSweep()

  return async () => {
    stopSweep()
    const l = listener
    listener = null
    status = { running: false, port: null }
    try {
      await l?.close()
    } catch {
      // closing is best effort
    }
  }
}
