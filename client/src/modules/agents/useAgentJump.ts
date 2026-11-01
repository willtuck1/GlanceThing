import { useContext, useEffect, useRef, useState } from 'react'

import { useAgents } from '@/contexts/AgentsContext.tsx'
import { AppBlurContext } from '@/contexts/AppBlurContext.tsx'
import { useClock } from '@/contexts/ClockContext.tsx'
import { SleepContext } from '@/contexts/SleepContext.tsx'
import { SocketContext } from '@/contexts/SocketContext.tsx'

import { initialJumpState, nextJump } from './autoJump.ts'
import { parseAgentsPayload } from './view.ts'

export const AGENTS_KEY = 'agents'

export interface Jump {
  key: string
  seq: number
}

// Tells the pager to go to the Agents tab when a session starts waiting, and
// wakes a sleeping device the way TimerAlert does.
export function useAgentJump(visibleKeys: string[]): Jump | undefined {
  const { payload } = useAgents()
  const { blurred } = useContext(AppBlurContext)
  const { timer } = useClock()
  const { sleepState, setSleepState } = useContext(SleepContext)
  const { socket } = useContext(SocketContext)
  const [jump, setJump] = useState<Jump | undefined>(undefined)
  const tracker = useRef(initialJumpState)
  const seq = useRef(0)
  const asleep = useRef(false)
  asleep.current = sleepState !== 'off'

  const blocked = blurred || timer?.state === 'ringing'
  const tabVisible = visibleKeys.indexOf(AGENTS_KEY) !== -1

  useEffect(() => {
    const parsed = parseAgentsPayload(payload)
    if (!parsed) return
    const r = nextJump(tracker.current, {
      sessions: parsed.sessions,
      blocked,
      tabVisible
    })
    tracker.current = r.state
    if (r.jumpKey === null) return
    seq.current += 1
    setJump({ key: AGENTS_KEY, seq: seq.current })
    if (asleep.current) {
      setSleepState('off')
      socket?.send(JSON.stringify({ type: 'wake' }))
    }
  }, [payload, blocked, tabVisible, setSleepState, socket])

  return jump
}
