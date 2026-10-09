import React, {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react'

import { SocketContext } from './SocketContext.tsx'
import { DISPLAY_FALLBACK, parseDisplay } from '@/lib/display.ts'

import type { DisplayAlphas } from '@/lib/display.ts'

const DisplayContext = createContext<DisplayAlphas>(DISPLAY_FALLBACK)

interface DisplayContextProviderProps {
  children: React.ReactNode
}

const DisplayContextProvider = ({
  children
}: DisplayContextProviderProps) => {
  const { ready, socket } = useContext(SocketContext)
  const [display, setDisplay] = useState<DisplayAlphas>(DISPLAY_FALLBACK)

  useEffect(() => {
    if (!ready || !socket) return

    const listener = (e: MessageEvent) => {
      const message = JSON.parse(e.data)
      if (message.type !== 'display' || message.action) return
      setDisplay(parseDisplay(message.data))
    }

    socket.addEventListener('message', listener)
    socket.send(JSON.stringify({ type: 'display' }))

    return () => {
      socket.removeEventListener('message', listener)
    }
  }, [ready, socket])

  return (
    <DisplayContext.Provider value={display}>
      {children}
    </DisplayContext.Provider>
  )
}

export { DisplayContext, DisplayContextProvider }
