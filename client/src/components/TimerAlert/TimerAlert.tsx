import { useEffect } from 'react'

import { useClock } from '@/contexts/ClockContext.tsx'
import { formatRemaining } from '@/lib/clockTime.ts'

import styles from './TimerAlert.module.css'

const EVENTS = ['keydown', 'wheel', 'mousedown', 'touchstart']

const TimerAlert: React.FC = () => {
  const { timer, send } = useClock()
  const ringing = timer?.state === 'ringing'

  useEffect(() => {
    if (!ringing) return
    const listener = (e: Event) => {
      e.stopImmediatePropagation()
      if (e.cancelable) e.preventDefault()
      send('dismiss')
    }
    EVENTS.forEach(t => window.addEventListener(t, listener, true))
    return () => {
      EVENTS.forEach(t => window.removeEventListener(t, listener, true))
    }
  }, [ringing, send])

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
