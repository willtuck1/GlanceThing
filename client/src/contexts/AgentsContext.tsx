import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'

import { SocketContext } from './SocketContext.tsx'

import type { AgentsPayload } from '@/modules/agents/types.ts'

interface AgentsContextValue {
  payload: AgentsPayload | null
}

const AgentsContext = createContext<AgentsContextValue>({ payload: null })

const AgentsContextProvider = ({
  children
}: {
  children: React.ReactNode
}) => {
  const { ready, socket } = useContext(SocketContext)
  const [payload, setPayload] = useState<AgentsPayload | null>(null)

  useEffect(() => {
    if (!ready || !socket) return

    const listener = (e: MessageEvent) => {
      const message = JSON.parse(e.data)
      if (message.action || message.type !== 'agents') return
      const data = message.data
      // Minimal shape check only; the Agents tab re-validates every field.
      if (data && Array.isArray(data.sessions)) {
        setPayload(data as AgentsPayload)
      }
    }

    socket.addEventListener('message', listener)
    socket.send(JSON.stringify({ type: 'agents' }))

    return () => {
      socket.removeEventListener('message', listener)
    }
  }, [ready, socket])

  const value = useMemo(() => ({ payload }), [payload])

  return (
    <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>
  )
}

const useAgents = () => useContext(AgentsContext)

export { AgentsContext, AgentsContextProvider, useAgents }
