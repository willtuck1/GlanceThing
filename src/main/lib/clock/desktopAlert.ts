import { Notification } from 'electron'

import type { TimerAlert } from './timer.js'

/** Only the newest notification is kept; older ones are closed first. */
let current: Notification | null = null

export function closeTimerNotification() {
  const n = current
  current = null
  if (!n) return
  try {
    n.close()
  } catch {
    /* ignore */
  }
}

export function showTimerNotification(
  alert: TimerAlert,
  durationMs: number,
  onClick?: () => void
) {
  if (alert === 'off') return
  try {
    if (!Notification.isSupported()) return
    closeTimerNotification()
    const minutes = Math.round(durationMs / 60000)
    const n = new Notification({
      title: 'Timer done',
      body: `${minutes} min timer finished`,
      silent: alert !== 'sound'
    })
    current = n
    n.on('close', () => {
      if (current === n) current = null
    })
    n.on('click', () => {
      if (current !== n) return
      current = null
      try {
        onClick?.()
      } catch {
        /* ignore */
      }
    })
    n.show()
  } catch {
    /* never throw */
  }
}
