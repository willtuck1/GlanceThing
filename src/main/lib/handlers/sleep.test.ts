import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => new Map<string, unknown>())
const adb = vi.hoisted(() => ({
  setAutoBrightness: vi.fn(async () => {}),
  setBrightnessSmooth: vi.fn(async () => {})
}))

vi.mock('../adb.js', () => adb)
vi.mock('../storage.js', () => ({
  getStorageValue: (k: string) => store.get(k) ?? null
}))

import { handle } from './sleep.js'

async function run(data?: unknown) {
  const send = vi.fn()
  await handle({ send } as never, data)
  return JSON.parse(send.mock.calls[0][0])
}

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
})

describe('sleep handler', () => {
  it('uses the stored method with no data', async () => {
    store.set('sleepMethod', 'screensaver')
    expect((await run()).data).toBe('screensaver')
    expect(adb.setBrightnessSmooth).toHaveBeenCalledWith(null, 0.1, 10)
  })

  it('defaults to sleep', async () => {
    expect((await run()).data).toBe('sleep')
  })

  it('sends clock for {method:"clock"} and dims to 0.2', async () => {
    store.set('sleepMethod', 'sleep')
    expect((await run({ method: 'clock' })).data).toBe('clock')
    expect(adb.setBrightnessSmooth).toHaveBeenCalledWith(null, 0.2, 10)
  })

  it('sends clock when stored method is clock', async () => {
    store.set('sleepMethod', 'clock')
    expect((await run()).data).toBe('clock')
  })

  it('ignores unknown methods', async () => {
    store.set('sleepMethod', 'screensaver')
    expect((await run({ method: 'evil' })).data).toBe('screensaver')
  })
})
