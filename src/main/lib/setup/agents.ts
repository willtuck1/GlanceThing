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

type Listener = Awaited<ReturnType<typeof startAgentsListener>>

// Module level so a second setup() (ws server restarted, or a failed ws
// listen) closes the first listener instead of leaving it bound.
let listener: Listener | null = null
let generation = 0

async function closeListener(): Promise<void> {
  const l = listener
  listener = null
  status = { running: false, port: null }
  try {
    await l?.close()
  } catch {
    // closing is best effort
  }
}

export const setup: SetupFunction = async () => {
  const gen = ++generation
  await closeListener()
  try {
    const l = await startAgentsListener({
      port: AGENTS_DEFAULT_PORT,
      maxTries: MAX_TRIES,
      token: getAgentsToken,
      adapters: () => adapters,
      onStatus: ingestStatus
    })
    if (gen !== generation) {
      // A newer setup() started meanwhile; it owns the listener.
      await l.close().catch(() => {})
      return async () => {}
    }
    listener = l
    status = { running: true, port: l.port }
  } catch {
    if (gen !== generation) return async () => {}
    status = {
      running: false,
      port: null,
      error: `Could not start on ports ${AGENTS_DEFAULT_PORT}–${AGENTS_DEFAULT_PORT + MAX_TRIES - 1}`
    }
  }
  startSweep()

  return async () => {
    // A cleanup from a superseded setup() must not stop the newer one.
    if (gen !== generation) return
    stopSweep()
    await closeListener()
  }
}
