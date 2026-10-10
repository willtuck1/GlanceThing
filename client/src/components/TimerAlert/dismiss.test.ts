import { describe, expect, it, vi } from 'vitest'

import { createDismissHandler, shouldDismiss } from './dismiss.ts'

const ev = () => ({
  stopImmediatePropagation: vi.fn(),
  preventDefault: vi.fn(),
  cancelable: true
})

describe('shouldDismiss', () => {
  it('only while ringing', () => {
    expect(shouldDismiss('ringing')).toBe(true)
    for (const s of ['idle', 'running', 'paused', undefined]) {
      expect(shouldDismiss(s)).toBe(false)
    }
  })
})

describe('createDismissHandler', () => {
  it('swallows every input but dismisses and wakes once', () => {
    const send = vi.fn()
    const wake = vi.fn()
    const h = createDismissHandler(send, wake)
    const a = ev()
    const b = ev()
    h(a)
    h(b)
    expect(a.stopImmediatePropagation).toHaveBeenCalled()
    expect(a.preventDefault).toHaveBeenCalled()
    expect(b.stopImmediatePropagation).toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('dismiss')
    expect(wake).toHaveBeenCalledTimes(1)
  })
})
