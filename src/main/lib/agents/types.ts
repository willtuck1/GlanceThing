/** States an agent session can report. Order is display order for counts. */
export const AGENT_STATES = ['working', 'waiting', 'idle', 'stopped'] as const
export type AgentState = (typeof AGENT_STATES)[number]

/** One validated status update posted to the local listener (untrusted origin, cleaned by `parseAgentStatus`). */
export interface AgentStatus {
  /** Sender id, /^[a-z0-9-]{1,24}$/ (an adapter id for hook routes). */
  source: string
  /** Session id from the sender, printable ASCII, 1–128 chars. */
  sessionId: string
  /** Display label, cleaned, ≤24 code points. */
  label?: string
  state: AgentState
  /** One-line detail, cleaned, ≤48 code points. */
  detail?: string
  /** True when the session ended (state is then forced to 'stopped'). */
  end?: boolean
}

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

/** Maps one tool's hook payload to an `AgentStatus`. */
export interface AgentAdapter {
  id: string
  label: string
  /** Returns null when the payload isn't usable. */
  toStatus(payload: unknown): AgentStatus | null
  /** Config text the user pastes into the tool. */
  configSnippet(port: number, token: string): string
  setupSteps: string[]
}

/** Caps applied to untrusted input and to the store. */
export const AGENT_LIMITS = {
  /** `source` length. */
  sourceMax: 24,
  /** `sessionId` length. */
  sessionIdMax: 128,
  /** `label` code points. */
  labelMax: 24,
  /** `detail` code points. */
  detailMax: 48,
  /** `sourceLabel` length. */
  sourceLabelMax: 8,
  /** Sessions kept by the store. */
  maxSessions: 12,
  /** Request body bytes. */
  bodyMax: 65536
} as const
