import { useContext, useEffect } from 'react'

import { useClock } from '@/contexts/ClockContext.tsx'
import { SleepContext } from '@/contexts/SleepContext.tsx'
import { SocketContext } from '@/contexts/SocketContext.tsx'
import { formatRemaining } from '@/lib/clockTime.ts'

import { createDismissHandler, shouldDismiss } from './dismiss.ts'

import styles from './TimerAlert.module.css'

const EVENTS = ['keydown', 'wheel', 'mousedown', 'touchstart']

const TimerAlert: React.FC = () => {
  const { timer, send } = useClock()
  const { sleepState, setSleepState } = useContext(SleepContext)
  const { socket } = useContext(SocketContext)
  const ringing = shouldDismiss(timer?.state)
  const asleep = sleepState !== 'off'

  useEffect(() => {
    if (!ringing) return
    // The dismissing key never reaches SleepContext, so wake here too.
    const listener = createDismissHandler(send, () => {
      if (!asleep) return
      setSleepState('off')
      socket?.send(JSON.stringify({ type: 'wake' }))
    })
    EVENTS.forEach(t => window.addEventListener(t, listener, true))
    return () => {
      EVENTS.forEach(t => window.removeEventListener(t, listener, true))
    }
  }, [ringing, send, asleep, setSleepState, socket])

  if (!ringing || !timer) return null

  return (
    <div className={styles.alert}>
      <div className={styles.title}>Timer done</div>
      <div className={styles.duration}>
        {formatRemaining(timer.durationMs)}
      </div>
      <div className={styles.hint}>Press any button to dismiss</div>
    </div>
  )
}

export default TimerAlert
