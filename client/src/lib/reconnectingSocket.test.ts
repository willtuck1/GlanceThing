import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CONNECT_TIMEOUT_MS,
  createReconnectingSocket,
  RETRY_DELAY_MS,
  SocketLike
} from './reconnectingSocket.ts'

class FakeSocket implements SocketLike {
  readyState = 0
  onopen: SocketLike['onopen'] = null
  onclose: SocketLike['onclose'] = null
  onerror: SocketLike['onerror'] = null
  closed = false

  close() {
    this.closed = true
  }
  open() {
    this.readyState = 1
    this.onopen?.({} as Event)
  }
  fireClose() {
    this.readyState = 3
    this.onclose?.({} as CloseEvent)
  }
}

function setup() {
  const sockets: FakeSocket[] = []
  const onOpen = vi.fn()
  const onDown = vi.fn()
  const rs = createReconnectingSocket({
    create: () => {
      const s = new FakeSocket()
      sockets.push(s)
      return s
    },
    onOpen,
    onDown
  })
  rs.start()
  return { rs, sockets, onOpen, onDown }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createReconnectingSocket', () => {
  it('reports the open socket', () => {
    const { rs, sockets, onOpen } = setup()
    sockets[0].open()
    expect(onOpen).toHaveBeenCalledWith(sockets[0])
    expect(rs.socket).toBe(sockets[0])
  })

  it('reconnects after a close', () => {
    const { sockets, onDown } = setup()
    sockets[0].open()
    sockets[0].fireClose()
    expect(onDown).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(RETRY_DELAY_MS)
    expect(sockets).toHaveLength(2)
  })

  it('gives up on an attempt that hangs and tries again', () => {
    const { sockets, onDown } = setup()
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets[0].closed).toBe(true)
    expect(onDown).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(RETRY_DELAY_MS)
    expect(sockets).toHaveLength(2)
  })

  it('keeps retrying while the desktop app is unreachable', () => {
    const { sockets } = setup()
    for (let i = 0; i < 5; i++) {
      sockets[sockets.length - 1].fireClose()
      vi.advanceTimersByTime(RETRY_DELAY_MS)
    }
    expect(sockets).toHaveLength(6)
  })

  it('ignores a late close from a replaced socket', () => {
    const { rs, sockets, onDown, onOpen } = setup()
    sockets[0].open()
    rs.restart() // e.g. missed pongs
    vi.advanceTimersByTime(RETRY_DELAY_MS)
    sockets[1].open()
    expect(onOpen).toHaveBeenCalledTimes(2)

    // The old socket's close event finally arrives: handlers were detached,
    // and even if called it must not affect the new one.
    sockets[0].fireClose()
    expect(onDown).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(10 * RETRY_DELAY_MS)
    expect(sockets).toHaveLength(2)
    expect(rs.socket).toBe(sockets[1])
  })

  it('does not start two retries for one drop', () => {
    const { rs, sockets } = setup()
    sockets[0].open()
    rs.restart()
    rs.restart()
    vi.advanceTimersByTime(RETRY_DELAY_MS)
    expect(sockets).toHaveLength(2)
  })

  it('stops for good', () => {
    const { rs, sockets } = setup()
    sockets[0].open()
    rs.stop()
    expect(sockets[0].closed).toBe(true)
    vi.advanceTimersByTime(10 * CONNECT_TIMEOUT_MS)
    expect(sockets).toHaveLength(1)
    expect(rs.socket).toBeNull()
  })
})
