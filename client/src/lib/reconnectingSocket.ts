// Keeps one WebSocket to the desktop app open, reconnecting when it drops.
// Each attempt has a timeout, since a connection through a stuck adb
// tunnel can hang without ever failing. Events from sockets that were
// already replaced are ignored, so a late close can't knock out a newer
// connection or start a second one.

export const CONNECT_TIMEOUT_MS = 5000
export const RETRY_DELAY_MS = 1000

const OPEN = 1

export interface SocketLike {
  readyState: number
  onopen: ((ev: Event) => unknown) | null
  onclose: ((ev: CloseEvent) => unknown) | null
  onerror: ((ev: Event) => unknown) | null
  close(): void
}

export interface ReconnectingSocketOptions<S extends SocketLike> {
  create: () => S
  onOpen: (socket: S) => void
  onDown: () => void
  connectTimeoutMs?: number
  retryDelayMs?: number
}

export function createReconnectingSocket<S extends SocketLike>(
  options: ReconnectingSocketOptions<S>
) {
  const connectTimeout = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS
  const retryDelay = options.retryDelayMs ?? RETRY_DELAY_MS

  let current: S | null = null
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  function clearConnectTimer() {
    if (connectTimer) clearTimeout(connectTimer)
    connectTimer = null
  }

  function detach(socket: S) {
    socket.onopen = null
    socket.onclose = null
    socket.onerror = null
    try {
      socket.close()
    } catch {
      // Already closed.
    }
  }

  function connect() {
    retryTimer = null
    if (stopped) return

    const socket = options.create()
    current = socket

    connectTimer = setTimeout(() => {
      if (current === socket && socket.readyState !== OPEN) drop(socket)
    }, connectTimeout)

    socket.onopen = () => {
      if (current !== socket) return
      clearConnectTimer()
      options.onOpen(socket)
    }
    socket.onclose = () => drop(socket)
    // A close event follows every error.
    socket.onerror = () => {}
  }

  function drop(socket: S) {
    if (current !== socket) return
    current = null
    clearConnectTimer()
    detach(socket)
    options.onDown()
    if (!stopped && !retryTimer)
      retryTimer = setTimeout(connect, retryDelay)
  }

  return {
    start() {
      stopped = false
      if (!current && !retryTimer) connect()
    },
    // The open (or opening) socket, or null while waiting to retry.
    get socket() {
      return current
    },
    isCurrent(socket: S) {
      return current === socket
    },
    // Gives up on the current socket (e.g. missed pongs) and reconnects.
    restart() {
      if (current) drop(current)
    },
    stop() {
      stopped = true
      clearConnectTimer()
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null
      if (current) {
        const socket = current
        current = null
        detach(socket)
      }
    }
  }
}
