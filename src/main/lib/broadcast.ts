import { WebSocket } from 'ws'

import { AuthenticatedWebSocket } from '../types/WebSocketServer.js'

export function broadcastTo(
  clients: Iterable<AuthenticatedWebSocket>,
  type: string,
  data: unknown,
  action?: string
) {
  const message = JSON.stringify({ type, action, data })

  for (const client of clients) {
    if (!client.authenticated) continue
    if (client.readyState !== WebSocket.OPEN) continue
    client.send(message)
  }
}

export function hasOpenClient(clients: Iterable<AuthenticatedWebSocket>) {
  for (const client of clients) {
    if (client.authenticated && client.readyState === WebSocket.OPEN)
      return true
  }
  return false
}
