// Types copied from src/preload/index.d.ts (AgentsSettings); keep in sync.
export interface AgentsListener {
  running: boolean
  port: number | null
  error?: string
}

export interface AgentAdapterInfo {
  id: string
  label: string
  setupSteps: string[]
}

export function listenerText(listener: AgentsListener): string {
  if (listener.running && listener.port !== null) {
    return `Listening on 127.0.0.1:${listener.port}`
  }
  if (listener.error) return `Not listening: ${listener.error}`
  return 'Not listening'
}

// Never returns more than the last 4 characters of the token.
export function maskToken(token: string | null | undefined): string {
  if (!token) return 'Not set'
  return `••••••••${token.slice(-4)}`
}

export function stepsFor(adapter: AgentAdapterInfo): string[] {
  return adapter.setupSteps.map(s => s.trim()).filter(s => s.length > 0)
}

export interface AgentsSettings {
  listener: AgentsListener
  adapters: AgentAdapterInfo[]
}
