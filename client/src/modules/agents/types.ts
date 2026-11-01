// Copied from src/main/lib/agents/types.ts; keep in sync.

export const AGENT_STATES = [
  'working',
  'waiting',
  'idle',
  'stopped'
] as const
export type AgentState = (typeof AGENT_STATES)[number]

/** One session as shown on the device. */
export interface AgentCard {
  /** Stable key `<source>:<sessionId>`. */
  key: string
  source: string
  /** Short source name, ≤8 chars. */
  sourceLabel: string
  label: string
  state: AgentState
  detail: string
  /** Host epoch ms of the last state change. */
  sinceMs: number
}

/** Data of the `agents` message. */
export interface AgentsPayload {
  sessions: AgentCard[]
  counts: Record<AgentState, number>
}
