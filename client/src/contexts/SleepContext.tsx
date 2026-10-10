import React, {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react'

import { SocketContext } from './SocketContext.tsx'

import SleepClock from '@/components/SleepClock/SleepClock.tsx'
import Screensaver from '@/components/Screensaver/Screensaver.tsx'

export type SleepState = 'off' | 'screensaver' | 'sleep' | 'clock'

interface SleepContextProps {
  sleepState: SleepState
  setSleepState: (state: SleepState) => void
}

const SleepContext = createContext<SleepContextProps>({
  sleepState: 'off',
  setSleepState: () => null
})

interface SleepContextProviderProps {
  children: React.ReactNode
}

const SleepContextProvider = ({ children }: SleepContextProviderProps) => {
  const { ready, socket } = useContext(SocketContext)
  const [sleepState, setSleepState] = useState<SleepState>('off')

  useEffect(() => {
    function listener(e: KeyboardEvent | MouseEvent | WheelEvent) {
      if (sleepState === 'off') return
      e.stopImmediatePropagation()
      setSleepState('off')
      socket?.send(
        JSON.stringify({
          type: 'wake'
        })
      )
    }

    document.addEventListener('keydown', listener, {
      capture: true
    })
    document.addEventListener('wheel', listener, { capture: true })
    document.addEventListener('mousedown', listener)

    return () => {
      document.removeEventListener('keydown', listener, {
        capture: true
      })
      document.removeEventListener('wheel', listener, { capture: true })
      document.removeEventListener('mousedown', listener)
    }
  }, [socket, sleepState])

  useEffect(() => {
    if (ready === true && socket) {
      const listener = (e: MessageEvent) => {
        const { type, data } = JSON.parse(e.data)

        if (type === 'sleep') {
          setSleepState(data)
        } else if (type === 'wake') {
          setSleepState('off')
        }
      }

      socket.addEventListener('message', listener)

      return () => {
        socket.removeEventListener('message', listener)
      }
    }
  }, [ready, socket])

  useEffect(() => {
    if (ready) {
      setSleepState('off')
      socket!.send(
        JSON.stringify({
          type: 'wake'
        })
      )
    }
  }, [ready, socket])

  return (
    <SleepContext.Provider
      value={{
        sleepState,
        setSleepState
      }}
    >
      {children}
      <Screensaver type={sleepState} />
      {sleepState === 'clock' && <SleepClock />}
    </SleepContext.Provider>
  )
}

export { SleepContext, SleepContextProvider }
