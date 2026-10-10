import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({ values: {} as Record<string, string> }))

vi.mock('./storage.js', () => ({
  getStorageValue: (key: string) => storage.values[key]
}))
vi.mock('./server.js', () => ({
  serverManager: { getServer: () => null }
}))

import { clockSync } from './time.js'

describe('clockSync', () => {
  beforeEach(() => {
    storage.values = {}
  })

  it('is 24-hour by default and for HH:mm', () => {
    expect(clockSync().hour12).toBe(false)
    storage.values.timeFormat = 'HH:mm'
    expect(clockSync().hour12).toBe(false)
  })

  it.each(['h:mm A', 'hh:mm a'])('is 12-hour for %s', f => {
    storage.values.timeFormat = f
    expect(clockSync().hour12).toBe(true)
  })

  it('reports now, offset and formatted strings', () => {
    const d = new Date('2026-03-04T05:06:07Z')
    const r = clockSync(d)
    expect(r.now).toBe(d.getTime())
    expect(r.offsetMin).toBe(-d.getTimezoneOffset())
    expect(r.time).toMatch(/^\d{2}:\d{2}$/)
    expect(r.date.length).toBeGreaterThan(0)
  })
})
