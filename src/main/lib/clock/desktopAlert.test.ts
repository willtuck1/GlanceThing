import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  supported: true,
  throws: false,
  ctor: vi.fn(),
  show: vi.fn(),
  on: vi.fn(),
}))

vi.mock('electron', () => ({
  Notification: class {
    static isSupported() {
      return h.supported
    }
    constructor(opts: unknown) {
      if (h.throws) throw new Error('boom')
      h.ctor(opts)
    }
    show = h.show
    on = h.on
  },
}))

import { showTimerNotification } from './desktopAlert.js'

beforeEach(() => {
  h.supported = true
  h.throws = false
  h.ctor.mockClear()
  h.show.mockClear()
  h.on.mockClear()
})

describe('showTimerNotification', () => {
  it('off does nothing', () => {
    showTimerNotification('off', 60000)
    expect(h.ctor).not.toHaveBeenCalled()
  })

  it('notify is silent', () => {
    showTimerNotification('notify', 300000)
    expect(h.ctor).toHaveBeenCalledWith({
      title: 'Timer done',
      body: '5 min timer finished',
      silent: true,
    })
    expect(h.show).toHaveBeenCalled()
  })

  it('sound is not silent', () => {
    showTimerNotification('sound', 60000)
    expect(h.ctor.mock.calls[0][0].silent).toBe(false)
  })

  it('unsupported does nothing', () => {
    h.supported = false
    showTimerNotification('sound', 60000)
    expect(h.ctor).not.toHaveBeenCalled()
  })

  it('constructor throwing does not throw', () => {
    h.throws = true
    expect(() => showTimerNotification('sound', 60000)).not.toThrow()
  })

  it('click calls onClick', () => {
    const cb = vi.fn()
    showTimerNotification('notify', 60000, cb)
    const click = h.on.mock.calls.find(c => c[0] === 'click')![1]
    click()
    expect(cb).toHaveBeenCalled()
  })
})
