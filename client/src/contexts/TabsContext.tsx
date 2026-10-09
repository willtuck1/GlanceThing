import React, {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react'

import { SocketContext } from './SocketContext.tsx'
import { parseTabs } from '@/modules/tabs.ts'

import type { TabsSettings } from '@/modules/tabs.ts'

// null until the host replies (an older host never does).
const TabsContext = createContext<TabsSettings | null>(null)

interface TabsContextProviderProps {
  children: React.ReactNode
}

const TabsContextProvider = ({ children }: TabsContextProviderProps) => {
  const { ready, socket } = useContext(SocketContext)
  const [tabs, setTabs] = useState<TabsSettings | null>(null)

  useEffect(() => {
    if (!ready || !socket) return

    const listener = (e: MessageEvent) => {
      const message = JSON.parse(e.data)
      if (message.type !== 'tabs' || message.action) return
      const parsed = parseTabs(message.data)
      if (parsed) setTabs(parsed)
    }

    socket.addEventListener('message', listener)
    socket.send(JSON.stringify({ type: 'tabs' }))

    return () => {
      socket.removeEventListener('message', listener)
    }
  }, [ready, socket])

  return (
    <TabsContext.Provider value={tabs}>{children}</TabsContext.Provider>
  )
}

export { TabsContext, TabsContextProvider }
