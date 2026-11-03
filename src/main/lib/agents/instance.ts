import { serverManager } from '../server.js'
import { adapterLabel } from './adapters/registry.js'
import { createCoalescer } from './coalesce.js'
import { createAgentStore, type AgentStore } from './store.js'
import type { AgentStatus } from './types.js'

const SWEEP_MS = 60_000
const BROADCAST_MS = 250

let store: AgentStore | null = null
let sweepTimer: NodeJS.Timeout | null = null

/** Created on first use, never at module load. */
export function getAgentStore(): AgentStore {
  if (!store) {
    const coalescer = createCoalescer(
      () => serverManager.broadcast('agents', getAgentStore().payload()),
      BROADCAST_MS
    )
    store = createAgentStore({
      now: Date.now,
      onChange: () => coalescer.trigger()
    })
  }
  return store
}

/** Applies one adapter-mapped status (the listener's `onStatus`; its adapter id is unused). */
export function ingestStatus(status: AgentStatus): void {
  getAgentStore().apply(status, adapterLabel(status.source))
}

export function startSweep(): void {
  if (sweepTimer) return
  sweepTimer = setInterval(() => getAgentStore().sweep(), SWEEP_MS)
  sweepTimer.unref()
}

export function stopSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer)
  sweepTimer = null
}
