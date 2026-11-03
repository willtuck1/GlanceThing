import { describe, expect, it } from 'vitest'

import { initialJumpState, nextJump } from './autoJump.ts'

import type { AgentCard } from './types.ts'

const card = (
  key: string,
  state: AgentCard['state'],
  sinceMs = 1
): AgentCard => ({
  key,
  source: 'claude-code',
  sourceLabel: 'Claude',
  label: key,
  state,
  detail: '',
  sinceMs
})

const open = { blocked: false, tabVisible: true }

describe('nextJump', () => {
  it('jumps on the first payload with a waiting session', () => {
    const r = nextJump(initialJumpState, {
      sessions: [card('a', 'waiting')],
      ...open
    })
    expect(r.jumpKey).toBe('a')
  })

  it('jumps once per episode', () => {
    const sessions = [card('a', 'waiting')]
    const r1 = nextJump(initialJumpState, { sessions, ...open })
    const r2 = nextJump(r1.state, { sessions, ...open })
    expect(r1.jumpKey).toBe('a')
    expect(r2.jumpKey).toBeNull()
  })

  it('jumps again after leaving waiting', () => {
    const r1 = nextJump(initialJumpState, {
      sessions: [card('a', 'waiting')],
      ...open
    })
    const r2 = nextJump(r1.state, {
      sessions: [card('a', 'working')],
      ...open
    })
    const r3 = nextJump(r2.state, {
      sessions: [card('a', 'waiting')],
      ...open
    })
    expect(r2.jumpKey).toBeNull()
    expect(r3.jumpKey).toBe('a')
  })

  it('does not consume while blocked, then fires when unblocked', () => {
    const sessions = [card('a', 'waiting')]
    const r1 = nextJump(initialJumpState, {
      sessions,
      blocked: true,
      tabVisible: true
    })
    const r2 = nextJump(r1.state, { sessions, ...open })
    expect(r1.jumpKey).toBeNull()
    expect(r2.jumpKey).toBe('a')
  })

  it('does not jump when the tab is not visible', () => {
    const sessions = [card('a', 'waiting')]
    const r1 = nextJump(initialJumpState, {
      sessions,
      blocked: false,
      tabVisible: false
    })
    const r2 = nextJump(r1.state, { sessions, ...open })
    expect(r1.jumpKey).toBeNull()
    expect(r2.jumpKey).toBe('a')
  })

  it('makes one jump for two new waiting sessions, to the newest', () => {
    const sessions = [card('a', 'waiting', 5), card('b', 'waiting', 9)]
    const r1 = nextJump(initialJumpState, { sessions, ...open })
    const r2 = nextJump(r1.state, { sessions, ...open })
    expect(r1.jumpKey).toBe('b')
    expect(r2.jumpKey).toBeNull()
  })

  it('jumps for a new waiting session while another still waits', () => {
    const r1 = nextJump(initialJumpState, {
      sessions: [card('a', 'waiting')],
      ...open
    })
    const r2 = nextJump(r1.state, {
      sessions: [card('a', 'waiting'), card('b', 'waiting', 9)],
      ...open
    })
    expect(r2.jumpKey).toBe('b')
  })

  it('holds the jump until the tab list has settled', () => {
    const sessions = [card('a', 'waiting')]
    // blocked is true while the tabs reply is pending
    const r1 = nextJump(initialJumpState, {
      sessions,
      blocked: true,
      tabVisible: true
    })
    const r2 = nextJump(r1.state, { sessions, ...open })
    expect(r1.jumpKey).toBeNull()
    expect(r1.state.jumped).toEqual([])
    expect(r2.jumpKey).toBe('a')
  })
})
