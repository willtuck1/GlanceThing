import { beforeEach, describe, expect, it, vi } from 'vitest'

const events: string[] = []
let live = 0
let nextPort = 47816

vi.mock('../agents/listener.js', () => ({
  startAgentsListener: vi.fn(async () => {
    const port = nextPort++
    events.push(`start:${port}`)
    live++
    return {
      port,
      close: vi.fn(async () => {
        events.push(`close:${port}`)
        live--
      })
    }
  })
}))
vi.mock('../agents/adapters/registry.js', () => ({ adapters: [] }))
vi.mock('../agents/token.js', () => ({ getAgentsToken: () => 'tok' }))
vi.mock('../agents/instance.js', () => ({
  ingestStatus: vi.fn(),
  startSweep: vi.fn(),
  stopSweep: vi.fn()
}))

import { getListenerStatus, setup } from './agents.js'
import { startSweep, stopSweep } from '../agents/instance.js'

beforeEach(() => {
  events.length = 0
  live = 0
  nextPort = 47816
})

describe('agents setup', () => {
  it('closes the first listener before starting a second', async () => {
    await setup()
    const cleanup = await setup()
    expect(events).toEqual(['start:47816', 'close:47816', 'start:47817'])
    expect(live).toBe(1)
    expect(getListenerStatus()).toEqual({ running: true, port: 47817 })
    expect(startSweep).toHaveBeenCalled()

    await cleanup()
    expect(events.at(-1)).toBe('close:47817')
    expect(live).toBe(0)
    expect(stopSweep).toHaveBeenCalled()
    expect(getListenerStatus()).toEqual({ running: false, port: null })
  })

  it("a superseded setup's cleanup leaves the newer listener alone", async () => {
    const first = await setup()
    const second = await setup()
    await first()
    expect(live).toBe(1)
    await second()
    expect(live).toBe(0)
  })
})
