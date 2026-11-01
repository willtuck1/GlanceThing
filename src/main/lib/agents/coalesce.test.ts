import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoalescer } from './coalesce.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createCoalescer', () => {
  it('runs a leading call and one trailing call for a burst', () => {
    const fn = vi.fn()
    const c = createCoalescer(fn)
    for (let i = 0; i < 5; i++) {
      c.trigger()
      vi.advanceTimersByTime(20)
    }
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('trailing call sees the latest state', () => {
    let state = 0
    const seen: number[] = []
    const c = createCoalescer(() => seen.push(state))
    state = 1
    c.trigger()
    state = 2
    c.trigger()
    state = 3
    c.trigger()
    vi.advanceTimersByTime(250)
    expect(seen).toEqual([1, 3])
  })

  it('runs spaced triggers immediately', () => {
    const fn = vi.fn()
    const c = createCoalescer(fn)
    c.trigger()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)
    c.trigger()
    expect(fn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(300)
    c.trigger()
    expect(fn).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('never runs more than once per window', () => {
    const fn = vi.fn()
    const c = createCoalescer(fn)
    c.trigger()
    vi.advanceTimersByTime(200)
    c.trigger()
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(2)
    c.trigger()
    vi.advanceTimersByTime(249)
    expect(fn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('cancel drops the pending call', () => {
    const fn = vi.fn()
    const c = createCoalescer(fn)
    c.trigger()
    c.trigger()
    c.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush runs the pending call now, once', () => {
    const fn = vi.fn()
    const c = createCoalescer(fn)
    c.trigger()
    c.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    c.trigger()
    c.flush()
    expect(fn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('uses injected timers', () => {
    const calls: Array<() => void> = []
    const timers = {
      setTimeout: (f: () => void) => {
        calls.push(f)
        return calls.length
      },
      clearTimeout: vi.fn()
    }
    const fn = vi.fn()
    const c = createCoalescer(fn, 250, timers)
    c.trigger()
    c.trigger()
    expect(fn).toHaveBeenCalledTimes(1)
    calls[0]()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
