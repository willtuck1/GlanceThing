import { describe, expect, it, vi } from 'vitest'

const payload = vi.hoisted(() => ({
  sessions: [],
  counts: { working: 1, waiting: 0, idle: 0, stopped: 0 }
}))

vi.mock('../../agents/instance.js', () => ({
  getAgentStore: () => ({ payload: () => payload })
}))

import { handle, hasActions, name } from './handler.js'

describe('agents handler', () => {
  it('replies with the payload to the requesting client only', async () => {
    const ws = { send: vi.fn() }
    await handle(ws as never, undefined as never)
    expect(name).toBe('agents')
    expect(hasActions).toBe(false)
    expect(ws.send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      type: 'agents',
      data: payload
    })
  })
})
