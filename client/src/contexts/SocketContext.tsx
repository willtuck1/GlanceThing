import React, { createContext, useEffect, useRef, useState } from 'react'

import { getSocketPassword } from '@/lib/utils.ts'
import { createReconnectingSocket } from '@/lib/reconnectingSocket.ts'

interface SocketContextProps {
  ready: boolean
  firstLoad: boolean
  socket: WebSocket | null
}

const SocketContext = createContext<SocketContextProps>({
  ready: false,
  firstLoad: true,
  socket: null
})

interface SocketContextProviderProps {
  children: React.ReactNode
}

const SocketContextProvider = ({
  children
}: SocketContextProviderProps) => {
  const [ready, setReady] = useState(false)
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [firstLoad, setFirstLoad] = useState(true)
  const rs = useRef<ReturnType<
    typeof createReconnectingSocket<WebSocket>
  > | null>(null)

  useEffect(() => {
    const manager = createReconnectingSocket<WebSocket>({
      create: () => new WebSocket('ws://localhost:1337'),
      onOpen: async ws => {
        const pass = await getSocketPassword().catch(() => '')
        // Dropped while fetching the password.
        if (!manager.isCurrent(ws)) return
        if (pass)
          ws.send(
            JSON.stringify({
              type: 'auth',
              data: pass
            })
          )
        setSocket(ws)
        setReady(true)
        setTimeout(() => {
          setFirstLoad(false)
        }, 500)
      },
      onDown: () => {
        setReady(false)
        setSocket(null)
      }
    })
    rs.current = manager
    manager.start()

    return () => {
      manager.stop()
    }
  }, [])

  const missedPongsRef = useRef(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!ready || !socket) return

    const sendPing = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }))

        timeoutRef.current = setTimeout(() => {
          missedPongsRef.current += 1
          if (missedPongsRef.current >= 3) {
            missedPongsRef.current = 0
            rs.current?.restart()
          }
        }, 5000)
      }
    }

    const listener = (e: MessageEvent) => {
      const { type } = JSON.parse(e.data)
      if (type !== 'pong') return

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      missedPongsRef.current = 0
    }

    socket.addEventListener('message', listener)
    const interval = setInterval(sendPing, 5000)

    return () => {
      clearInterval(interval)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      missedPongsRef.current = 0
      socket.removeEventListener('message', listener)
    }
  }, [ready, socket])

  return (
    <SocketContext.Provider
      value={{
        ready,
        firstLoad,
        socket
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export { SocketContext, SocketContextProvider }
