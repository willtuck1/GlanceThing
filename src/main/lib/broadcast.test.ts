import { describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'

import { broadcastTo, hasOpenClient } from './broadcast.js'

import { AuthenticatedWebSocket } from '../types/WebSocketServer.js'

function client(authenticated: boolean, readyState: number) {
  return {
    authenticated,
    readyState,
    send: vi.fn()
  } as unknown as AuthenticatedWebSocket
}

describe('broadcastTo', () => {
  it('sends only to authenticated, open clients', () => {
    const ok = client(true, WebSocket.OPEN)
    const unauth = client(false, WebSocket.OPEN)
    const closed = client(true, WebSocket.CLOSED)

    broadcastTo([ok, unauth, closed], 'todo', { a: 1 })

    expect(ok.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'todo', data: { a: 1 } })
    )
    expect(unauth.send).not.toHaveBeenCalled()
    expect(closed.send).not.toHaveBeenCalled()
  })
})

describe('hasOpenClient', () => {
  it('counts only authenticated, open clients', () => {
    expect(hasOpenClient([client(false, WebSocket.OPEN)])).toBe(false)
    expect(hasOpenClient([client(true, WebSocket.CLOSED)])).toBe(false)
    expect(hasOpenClient([client(true, WebSocket.OPEN)])).toBe(true)
    expect(hasOpenClient([])).toBe(false)
  })
})
