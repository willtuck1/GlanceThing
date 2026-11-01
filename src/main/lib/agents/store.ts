import {
  AGENT_LIMITS,
  AGENT_STATES,
  type AgentCard,
  type AgentState,
  type AgentStatus,
  type AgentsPayload
} from './types.js'

/** A working session silent this long is shown as stopped ("No signal"). */
export const WORKING_SILENCE_MS = 15 * 60_000
/** An ended session is removed this long after it ended. */
export const ENDED_TTL_MS = 10 * 60_000

const DEFAULT_DETAIL: Record<AgentState, string> = {
  working: 'Working',
  waiting: 'Waiting for you',
  idle: 'Idle',
  stopped: 'Stopped'
}

const SORT_ORDER: Record<AgentState, number> = {
  waiting: 0,
  stopped: 1,
  working: 2,
  idle: 3
}

interface Entry {
  card: AgentCard
  /** Last update of any kind. */
  updatedMs: number
  /** Set while the session is ended. */
  endedMs: number | null
}

export interface AgentStoreDeps {
  now: () => number
  onChange: () => void
}

export interface AgentStore {
  apply(status: AgentStatus, sourceLabel: string): void
  payload(): AgentsPayload
  sweep(): void
  clear(): void
}

/** In-memory agent sessions (never persisted). */
export function createAgentStore(deps: AgentStoreDeps): AgentStore {
  const entries = new Map<string, Entry>()

  function evictOne(): void {
    let victim: [string, Entry] | null = null
    let fallback: [string, Entry] | null = null
    for (const pair of entries) {
      const [, e] = pair
      if (!fallback || e.updatedMs < fallback[1].updatedMs) fallback = pair
      if (
        (e.card.state === 'idle' || e.card.state === 'stopped') &&
        (!victim || e.updatedMs < victim[1].updatedMs)
      )
        victim = pair
    }
    const chosen = victim ?? fallback
    if (chosen) entries.delete(chosen[0])
  }

  function apply(status: AgentStatus, sourceLabel: string): void {
    const now = deps.now()
    const key = `${status.source}:${status.sessionId}`
    const ended = status.end === true
    const state: AgentState = ended ? 'stopped' : status.state
    const detail =
      status.detail ?? (ended ? 'Session ended' : DEFAULT_DETAIL[state])
    const shortLabel = sourceLabel.slice(0, AGENT_LIMITS.sourceLabelMax)

    const existing = entries.get(key)
    if (!existing) {
      if (entries.size >= AGENT_LIMITS.maxSessions) evictOne()
      entries.set(key, {
        card: {
          key,
          source: status.source,
          sourceLabel: shortLabel,
          label: status.label ?? '',
          state,
          detail,
          sinceMs: now
        },
        updatedMs: now,
        endedMs: ended ? now : null
      })
      deps.onChange()
      return
    }

    const card = existing.card
    const label = status.label ?? card.label
    const changed =
      card.state !== state ||
      card.detail !== detail ||
      card.label !== label ||
      card.sourceLabel !== shortLabel

    existing.updatedMs = now
    if (ended) {
      if (existing.endedMs === null) existing.endedMs = now
    } else {
      existing.endedMs = null
    }
    if (!changed) return

    if (card.state !== state) card.sinceMs = now
    card.state = state
    card.detail = detail
    card.label = label
    card.sourceLabel = shortLabel
    deps.onChange()
  }

  function sweep(): void {
    const now = deps.now()
    let changed = false
    for (const [key, e] of entries) {
      if (e.endedMs !== null && now - e.endedMs >= ENDED_TTL_MS) {
        entries.delete(key)
        changed = true
      } else if (
        e.card.state === 'working' &&
        now - e.updatedMs >= WORKING_SILENCE_MS
      ) {
        e.card.state = 'stopped'
        e.card.detail = 'No signal'
        e.card.sinceMs = now
        changed = true
      }
    }
    if (changed) deps.onChange()
  }

  function payload(): AgentsPayload {
    const sessions = [...entries.values()]
      .map(e => ({ ...e.card }))
      .sort(
        (a, b) =>
          SORT_ORDER[a.state] - SORT_ORDER[b.state] ||
          b.sinceMs - a.sinceMs
      )
    const counts = Object.fromEntries(
      AGENT_STATES.map(s => [s, 0])
    ) as Record<AgentState, number>
    for (const s of sessions) counts[s.state]++
    return { sessions, counts }
  }

  function clear(): void {
    if (entries.size === 0) return
    entries.clear()
    deps.onChange()
  }

  return { apply, payload, sweep, clear }
}
