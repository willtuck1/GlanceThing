import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAgentStore,
  ENDED_TTL_MS,
  WORKING_SILENCE_MS,
  type AgentStore
} from './store.js'
import type { AgentStatus } from './types.js'

const MIN = 60_000

let t: number
let onChange: ReturnType<typeof vi.fn<() => void>>
let store: AgentStore

function status(over: Partial<AgentStatus> = {}): AgentStatus {
  return { source: 'claude', sessionId: 's1', state: 'working', ...over }
}

beforeEach(() => {
  t = 1_000_000
  onChange = vi.fn<() => void>()
  store = createAgentStore({ now: () => t, onChange })
})

describe('createAgentStore', () => {
  it('builds a card with defaults', () => {
    store.apply(status({ state: 'waiting' }), 'Claude Code')
    expect(store.payload().sessions).toEqual([
      {
        key: 'claude:s1',
        source: 'claude',
        sourceLabel: 'Claude C',
        label: '',
        state: 'waiting',
        detail: 'Waiting for you',
        sinceMs: t
      }
    ])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('exports the timing constants', () => {
    expect(WORKING_SILENCE_MS).toBe(15 * MIN)
    expect(ENDED_TTL_MS).toBe(10 * MIN)
  })

  it('marks a silent working session stopped after 15 min', () => {
    store.apply(status(), 'Claude')
    onChange.mockClear()
    t += 14 * MIN
    store.sweep()
    expect(store.payload().sessions[0].state).toBe('working')
    expect(onChange).not.toHaveBeenCalled()
    t += MIN
    store.sweep()
    const card = store.payload().sessions[0]
    expect(card).toMatchObject({
      state: 'stopped',
      detail: 'No signal',
      sinceMs: t
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    // Not ended: stays.
    t += 60 * MIN
    store.sweep()
    expect(store.payload().sessions).toHaveLength(1)
  })

  it('never times out idle sessions', () => {
    store.apply(status({ state: 'idle' }), 'Claude')
    t += 600 * MIN
    store.sweep()
    expect(store.payload().sessions[0].state).toBe('idle')
  })

  it('removes ended sessions after 10 min, not 9', () => {
    store.apply(status({ end: true }), 'Claude')
    expect(store.payload().sessions[0]).toMatchObject({
      state: 'stopped',
      detail: 'Session ended'
    })
    onChange.mockClear()
    t += 9 * MIN
    store.sweep()
    expect(store.payload().sessions).toHaveLength(1)
    expect(onChange).not.toHaveBeenCalled()
    t += MIN
    store.sweep()
    expect(store.payload().sessions).toHaveLength(0)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('changes sinceMs only on a state change', () => {
    store.apply(status({ detail: 'Reading' }), 'Claude')
    const first = t
    t += MIN
    store.apply(status({ detail: 'Editing' }), 'Claude')
    expect(store.payload().sessions[0]).toMatchObject({
      detail: 'Editing',
      sinceMs: first
    })
    t += MIN
    store.apply(status({ state: 'waiting' }), 'Claude')
    expect(store.payload().sessions[0].sinceMs).toBe(t)
  })

  it('keeps the label when an update has none', () => {
    store.apply(status({ label: 'repo' }), 'Claude')
    store.apply(status({ state: 'idle' }), 'Claude')
    expect(store.payload().sessions[0].label).toBe('repo')
    store.apply(status({ state: 'idle', label: 'other' }), 'Claude')
    expect(store.payload().sessions[0].label).toBe('other')
  })

  it('treats a duplicate status as a no-op', () => {
    store.apply(status({ label: 'x', detail: 'd' }), 'Claude')
    store.apply(status({ label: 'x', detail: 'd' }), 'Claude')
    store.apply(status({ detail: 'd' }), 'Claude')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('a duplicate status still counts as a signal', () => {
    store.apply(status(), 'Claude')
    t += 10 * MIN
    store.apply(status(), 'Claude')
    t += 10 * MIN
    store.sweep()
    expect(store.payload().sessions[0].state).toBe('working')
  })

  it('evicts the oldest idle/stopped session at 12', () => {
    for (let i = 0; i < 12; i++) {
      t += 1000
      store.apply(
        status({
          sessionId: `s${i}`,
          state: i === 3 || i === 7 ? 'idle' : 'working'
        }),
        'Claude'
      )
    }
    t += 1000
    store.apply(status({ sessionId: 'new' }), 'Claude')
    const keys = store.payload().sessions.map(s => s.key)
    expect(keys).toHaveLength(12)
    expect(keys).not.toContain('claude:s3')
    expect(keys).toContain('claude:s7')
    expect(keys).toContain('claude:s0')
    expect(keys).toContain('claude:new')
  })

  it('evicts the oldest session when none are idle/stopped', () => {
    for (let i = 0; i < 12; i++) {
      t += 1000
      store.apply(status({ sessionId: `s${i}` }), 'Claude')
    }
    t += 1000
    store.apply(status({ sessionId: 's0', detail: 'fresh' }), 'Claude')
    t += 1000
    store.apply(status({ sessionId: 'new' }), 'Claude')
    const keys = store.payload().sessions.map(s => s.key)
    expect(keys).toHaveLength(12)
    expect(keys).toContain('claude:s0')
    expect(keys).not.toContain('claude:s1')
  })

  it('counts all states and sorts waiting, stopped, working, idle, then newest', () => {
    expect(store.payload().counts).toEqual({
      working: 0,
      waiting: 0,
      idle: 0,
      stopped: 0
    })
    store.apply(status({ sessionId: 'a', state: 'idle' }), 'C')
    t += 1
    store.apply(status({ sessionId: 'b', state: 'working' }), 'C')
    t += 1
    store.apply(status({ sessionId: 'c', state: 'waiting' }), 'C')
    t += 1
    store.apply(status({ sessionId: 'd', state: 'working' }), 'C')
    t += 1
    store.apply(status({ sessionId: 'e', end: true }), 'C')
    const p = store.payload()
    expect(p.sessions.map(s => s.key)).toEqual([
      'claude:c',
      'claude:e',
      'claude:d',
      'claude:b',
      'claude:a'
    ])
    expect(p.counts).toEqual({
      working: 2,
      waiting: 1,
      idle: 1,
      stopped: 1
    })
  })

  it('returns fresh copies', () => {
    store.apply(status(), 'Claude')
    store.payload().sessions[0].label = 'mutated'
    expect(store.payload().sessions[0].label).toBe('')
  })

  it('keeps two sources with the same sessionId apart', () => {
    store.apply(status({ source: 'claude' }), 'Claude')
    store.apply(status({ source: 'codex' }), 'Codex')
    expect(
      store
        .payload()
        .sessions.map(s => s.key)
        .sort()
    ).toEqual(['claude:s1', 'codex:s1'])
  })

  it('revives an ended session on a fresh start (idle)', () => {
    store.apply(status({ end: true }), 'Claude')
    t += 5 * MIN
    store.apply(status({ state: 'idle' }), 'Claude')
    expect(store.payload().sessions[0]).toMatchObject({
      state: 'idle',
      sinceMs: t
    })
    t += 20 * MIN
    store.sweep()
    expect(store.payload().sessions).toHaveLength(1)
  })

  it('ignores a stray working event after the end', () => {
    store.apply(status({ end: true }), 'Claude')
    const endedAt = t
    t += 2 * MIN
    store.apply(status({ state: 'working' }), 'Claude')
    expect(store.payload().sessions[0]).toMatchObject({
      state: 'stopped',
      detail: 'Session ended',
      sinceMs: endedAt
    })
    t = endedAt + ENDED_TTL_MS - 1
    store.sweep()
    expect(store.payload().sessions).toHaveLength(1)
    t = endedAt + ENDED_TTL_MS
    store.sweep()
    expect(store.payload().sessions).toEqual([])
  })

  it('clear empties the store', () => {
    store.apply(status(), 'Claude')
    store.clear()
    expect(store.payload().sessions).toEqual([])
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
