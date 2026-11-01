import { AGENT_STATES } from './types.ts'

import type { AgentCard, AgentsPayload, AgentState } from './types.ts'

export const STATE_ORDER: AgentState[] = [
  'waiting',
  'stopped',
  'working',
  'idle'
]

export const STATE_WORD: Record<AgentState, string> = {
  working: 'Working',
  waiting: 'Needs you',
  idle: 'Idle',
  stopped: 'Stopped'
}

export const STATE_COLOR: Record<AgentState, string> = {
  working: '#30D158',
  waiting: '#FFD60A',
  idle: '#8E8E93',
  stopped: '#FF453A'
}

export function sortCards(cards: AgentCard[]): AgentCard[] {
  return cards.slice().sort((a, b) => {
    const d = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state)
    return d !== 0 ? d : b.sinceMs - a.sinceMs
  })
}

export function summary(counts: Record<AgentState, number>): string {
  const parts: string[] = []
  if (counts.waiting > 0) parts.push(`${counts.waiting} needs you`)
  if (counts.stopped > 0) parts.push(`${counts.stopped} stopped`)
  if (counts.working > 0) parts.push(`${counts.working} working`)
  if (counts.idle > 0) parts.push(`${counts.idle} idle`)
  return parts.length ? parts.join(' · ') : 'No agents running'
}

export function formatElapsed(ms: number): string {
  const min = Math.floor(ms / 60000)
  if (!(min > 0)) return '0m'
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

function parseCard(v: unknown): AgentCard | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (
    typeof o.key !== 'string' ||
    typeof o.source !== 'string' ||
    typeof o.sourceLabel !== 'string' ||
    typeof o.label !== 'string' ||
    typeof o.detail !== 'string' ||
    typeof o.state !== 'string' ||
    !(AGENT_STATES as readonly string[]).includes(o.state) ||
    typeof o.sinceMs !== 'number' ||
    !isFinite(o.sinceMs)
  )
    return null
  return {
    key: o.key,
    source: o.source,
    sourceLabel: o.sourceLabel,
    label: o.label,
    state: o.state as AgentState,
    detail: o.detail,
    sinceMs: o.sinceMs
  }
}

export function parseAgentsPayload(v: unknown): AgentsPayload | null {
  if (typeof v !== 'object' || v === null) return null
  const s = (v as { sessions?: unknown }).sessions
  if (!Array.isArray(s)) return null
  const sessions: AgentCard[] = []
  const counts: Record<AgentState, number> = {
    working: 0,
    waiting: 0,
    idle: 0,
    stopped: 0
  }
  for (const item of s) {
    const c = parseCard(item)
    if (!c) continue
    sessions.push(c)
    counts[c.state]++
  }
  return { sessions, counts }
}

export function visibleCards(
  cards: AgentCard[],
  max = 12
): { cards: AgentCard[]; more: number } {
  const sorted = sortCards(cards)
  return {
    cards: sorted.slice(0, max),
    more: Math.max(0, sorted.length - max)
  }
}
