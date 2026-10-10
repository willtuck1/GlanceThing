import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  supported: true,
  throws: false,
  ctor: vi.fn(),
  show: vi.fn(),
  on: vi.fn(),
  closed: 0
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
    close() {
      h.closed++
    }
    on = h.on
  },
}))

import {
  closeTimerNotification,
  showTimerNotification
} from './desktopAlert.js'

beforeEach(() => {
  h.supported = true
  h.throws = false
  h.ctor.mockClear()
  h.show.mockClear()
  h.on.mockClear()
  h.closed = 0
  closeTimerNotification()
  h.closed = 0
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

describe('closing', () => {
  it('second show closes the first', () => {
    showTimerNotification('notify', 60000)
    showTimerNotification('notify', 60000)
    expect(h.ctor).toHaveBeenCalledTimes(2)
    expect(h.closed).toBe(1)
  })

  it('closeTimerNotification closes once', () => {
    showTimerNotification('notify', 60000)
    const before = h.closed
    closeTimerNotification()
    closeTimerNotification()
    expect(h.closed).toBe(before + 1)
  })

  it('click after close does not call onClick', () => {
    const cb = vi.fn()
    showTimerNotification('notify', 60000, cb)
    const click = h.on.mock.calls.filter(c => c[0] === 'click').at(-1)![1]
    closeTimerNotification()
    click()
    expect(cb).not.toHaveBeenCalled()
  })

  it('click on an old notification is ignored', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    showTimerNotification('notify', 60000, cb1)
    const click1 = h.on.mock.calls.filter(c => c[0] === 'click').at(-1)![1]
    showTimerNotification('notify', 60000, cb2)
    click1()
    expect(cb1).not.toHaveBeenCalled()
  })
})
