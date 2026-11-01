import { describe, expect, it } from 'vitest'

import {
  cardDetail,
  formatElapsed,
  parseAgentsPayload,
  sortCards,
  summary,
  visibleCards
} from './view.ts'

import type { AgentCard, AgentState } from './types.ts'

const card = (key: string, state: AgentState, sinceMs = 0): AgentCard => ({
  key,
  source: 'claude',
  sourceLabel: 'Claude',
  label: key,
  state,
  detail: '',
  sinceMs
})

const counts = (p: Partial<Record<AgentState, number>> = {}) => ({
  working: 0,
  waiting: 0,
  idle: 0,
  stopped: 0,
  ...p
})

describe('sortCards', () => {
  it('orders by state then newest first, without mutating', () => {
    const input = [
      card('i', 'idle', 5),
      card('w1', 'working', 1),
      card('s', 'stopped', 1),
      card('n', 'waiting', 1),
      card('w2', 'working', 9)
    ]
    const copy = input.slice()
    expect(sortCards(input).map(c => c.key)).toEqual([
      'n',
      's',
      'w2',
      'w1',
      'i'
    ])
    expect(input).toEqual(copy)
  })
})

describe('summary', () => {
  it('lists non-zero counts in order', () => {
    expect(summary(counts({ waiting: 1, working: 2, idle: 1 }))).toBe(
      '1 needs you · 2 working · 1 idle'
    )
    expect(summary(counts({ stopped: 3, idle: 1 }))).toBe(
      '3 stopped · 1 idle'
    )
  })
  it('handles none', () => {
    expect(summary(counts())).toBe('No agents running')
  })
})

describe('formatElapsed', () => {
  it('formats', () => {
    expect(formatElapsed(0)).toBe('0m')
    expect(formatElapsed(59999)).toBe('0m')
    expect(formatElapsed(4 * 60000 + 30000)).toBe('4m')
    expect(formatElapsed(59 * 60000)).toBe('59m')
    expect(formatElapsed(62 * 60000)).toBe('1h 2m')
    expect(formatElapsed(120 * 60000)).toBe('2h 0m')
    expect(formatElapsed(-5000)).toBe('0m')
  })
})

describe('parseAgentsPayload', () => {
  it('rejects non-payloads', () => {
    expect(parseAgentsPayload(null)).toBeNull()
    expect(parseAgentsPayload('x')).toBeNull()
    expect(parseAgentsPayload({})).toBeNull()
    expect(parseAgentsPayload({ sessions: 1 })).toBeNull()
  })
  it('drops malformed cards and recomputes counts', () => {
    const p = parseAgentsPayload({
      sessions: [
        card('a', 'working'),
        { ...card('b', 'idle'), state: 'bogus' },
        { ...card('c', 'idle'), sinceMs: NaN },
        { ...card('d', 'idle'), detail: 3 },
        null,
        card('e', 'waiting')
      ],
      counts: counts({ idle: 99 })
    })
    expect(p?.sessions.map(c => c.key)).toEqual(['a', 'e'])
    expect(p?.counts).toEqual(counts({ working: 1, waiting: 1 }))
  })
})

describe('visibleCards', () => {
  it('caps and counts the rest', () => {
    const cards = Array.from({ length: 15 }, (_, i) =>
      card('k' + i, 'idle', i)
    )
    const v = visibleCards(cards)
    expect(v.cards).toHaveLength(12)
    expect(v.more).toBe(3)
    expect(v.cards[0].key).toBe('k14')
    expect(visibleCards(cards, 20).more).toBe(0)
  })
})

describe('cardDetail', () => {
  it('hides details that repeat the state', () => {
    expect(
      cardDetail({ ...card('a', 'working'), detail: 'working' })
    ).toBe('')
    expect(cardDetail({ ...card('a', 'idle'), detail: 'IDLE' })).toBe('')
    expect(
      cardDetail({ ...card('a', 'stopped'), detail: 'Stopped' })
    ).toBe('')
    expect(
      cardDetail({ ...card('a', 'waiting'), detail: 'Needs you' })
    ).toBe('')
    expect(cardDetail(card('a', 'working'))).toBe('')
  })

  it('keeps real details', () => {
    expect(
      cardDetail({ ...card('a', 'working'), detail: 'Running Bash' })
    ).toBe('Running Bash')
    expect(cardDetail({ ...card('a', 'idle'), detail: 'Working' })).toBe(
      'Working'
    )
  })
})
