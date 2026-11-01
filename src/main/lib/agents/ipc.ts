// Desktop Settings IPC for the Agents panel. `getAgentsSettings` never
// contains the token; only `getAgentsToken`, `regenerateAgentsToken` and
// `getAgentsSnippet` return it, and only to the desktop renderer. Nothing
// here logs the token or a snippet.

import { AGENTS_DEFAULT_PORT, getListenerStatus } from '../setup/agents.js'

import { adapters, findAdapter } from './adapters/registry.js'
import { customCurl } from './snippets.js'
import { getAgentsToken, regenerateAgentsToken } from './token.js'

export interface AgentsSettings {
  listener: { running: boolean; port: number | null; error?: string }
  adapters: { id: string; label: string; setupSteps: string[] }[]
}

export function ipcGetAgentsSettings(): AgentsSettings {
  const status = getListenerStatus()
  return {
    listener: {
      running: status.running,
      port: status.port,
      ...(status.error !== undefined ? { error: status.error } : {})
    },
    adapters: adapters.map(a => ({
      id: a.id,
      label: a.label,
      setupSteps: [...a.setupSteps]
    }))
  }
}

export function ipcGetAgentsToken(): string {
  return getAgentsToken()
}

export function ipcRegenerateAgentsToken(): string {
  return regenerateAgentsToken()
}

// 'custom' → generic curl example; an adapter id → its config snippet;
// anything else → null. Never throws.
export function ipcGetAgentsSnippet(id: unknown): string | null {
  if (typeof id !== 'string') return null
  try {
    // Listener down: show the default port so the user can still copy.
    const port = getListenerStatus().port ?? AGENTS_DEFAULT_PORT
    if (id === 'custom') return customCurl(port, getAgentsToken())
    const adapter = findAdapter(id)
    if (!adapter) return null
    return adapter.configSnippet(port, getAgentsToken())
  } catch {
    return null
  }
}
