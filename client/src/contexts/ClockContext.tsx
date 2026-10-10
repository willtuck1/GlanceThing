import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'

import { SocketContext } from './SocketContext.tsx'
import { anchorFrom, hostNow } from '@/lib/clockTime.ts'

import type { ClockAnchor } from '@/lib/clockTime.ts'

export type ClockStyle = 'digital' | 'analog'

export interface ClockSettings {
  tabStyle: ClockStyle
  sleepStyle: ClockStyle
  widgets: string[]
  keyDebug: boolean
}

export interface TimerPayload {
  state: 'idle' | 'running' | 'paused' | 'ringing'
  durationMs: number
  remainingMs: number
  alert: 'off' | 'notify' | 'sound'
  lastAlert?: unknown
  lastMinutes?: number
}

export const CLOCK_DEFAULTS: ClockSettings = {
  tabStyle: 'digital',
  sleepStyle: 'digital',
  widgets: ['weather', 'calendar', 'todo', 'sports', 'fantasy'],
  keyDebug: false
}

const style = (v: unknown, fallback: ClockStyle): ClockStyle =>
  v === 'digital' || v === 'analog' ? v : fallback

export const parseClock = (data: unknown): ClockSettings => {
  const d = (data ?? {}) as Record<string, unknown>
  return {
    tabStyle: style(d.tabStyle, CLOCK_DEFAULTS.tabStyle),
    sleepStyle: style(d.sleepStyle, CLOCK_DEFAULTS.sleepStyle),
    widgets: Array.isArray(d.widgets)
      ? d.widgets.filter((w): w is string => typeof w === 'string')
      : CLOCK_DEFAULTS.widgets,
    keyDebug: d.keyDebug === true
  }
}

interface ClockContextValue {
  anchor: ClockAnchor | null
  timeStrings: { time: string | null; date: string | null }
  clock: ClockSettings
  timer: TimerPayload | null
  timerAt: number
  send: (action: string, data?: unknown) => void
}

const ClockContext = createContext<ClockContextValue>({
  anchor: null,
  timeStrings: { time: null, date: null },
  clock: CLOCK_DEFAULTS,
  timer: null,
  timerAt: 0,
  send: () => {}
})

const ClockContextProvider = ({
  children
}: {
  children: React.ReactNode
}) => {
  const { ready, socket } = useContext(SocketContext)
  const [anchor, setAnchor] = useState<ClockAnchor | null>(null)
  const [timeStrings, setTimeStrings] = useState<{
    time: string | null
    date: string | null
  }>({ time: null, date: null })
  const [clock, setClock] = useState<ClockSettings>(CLOCK_DEFAULTS)
  const [timer, setTimer] = useState<TimerPayload | null>(null)
  const [timerAt, setTimerAt] = useState(0)

  useEffect(() => {
    if (!ready || !socket) return

    const listener = (e: MessageEvent) => {
      const message = JSON.parse(e.data)
      if (message.action) return
      if (message.type === 'time') {
        const data = message.data ?? {}
        setTimeStrings({
          time: typeof data.time === 'string' ? data.time : null,
          date: typeof data.date === 'string' ? data.date : null
        })
        setAnchor(anchorFrom(data, performance.now()))
      } else if (message.type === 'clock') {
        setClock(parseClock(message.data))
      } else if (message.type === 'timer') {
        setTimer((message.data ?? null) as TimerPayload | null)
        setTimerAt(performance.now())
      }
    }

    const request = (type: string) => socket.send(JSON.stringify({ type }))

    socket.addEventListener('message', listener)
    request('time')
    request('clock')
    request('timer')
    const id = setInterval(() => request('time'), 60000)

    return () => {
      clearInterval(id)
      socket.removeEventListener('message', listener)
    }
  }, [ready, socket])

  const send = useCallback(
    (action: string, data?: unknown) => {
      if (!ready || !socket) return
      socket.send(JSON.stringify({ type: 'timer', action, data }))
    },
    [ready, socket]
  )

  const value = useMemo(
    () => ({ anchor, timeStrings, clock, timer, timerAt, send }),
    [anchor, timeStrings, clock, timer, timerAt, send]
  )

  return (
    <ClockContext.Provider value={value}>{children}</ClockContext.Provider>
  )
}

const useClock = () => useContext(ClockContext)

/** Host epoch ms, re-evaluated every `intervalMs`; null on old hosts. */
const useNow = (intervalMs: number): number | null => {
  const { anchor } = useClock()
  const [perf, setPerf] = useState(0)

  useEffect(() => {
    setPerf(performance.now())
    const id = setInterval(() => setPerf(performance.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, anchor])

  return anchor ? hostNow(anchor, Math.max(perf, anchor.perfMs)) : null
}

export {
  ClockContext,
  ClockContextProvider,
  ClockContextProvider as ClockProvider,
  useClock,
  useNow
}
