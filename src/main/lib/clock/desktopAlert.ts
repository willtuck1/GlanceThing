import { Notification } from 'electron'

import type { TimerAlert } from './timer.js'

const live = new Set<Notification>()

export function showTimerNotification(
  alert: TimerAlert,
  durationMs: number,
  onClick?: () => void
) {
  if (alert === 'off') return
  try {
    if (!Notification.isSupported()) return
    const minutes = Math.round(durationMs / 60000)
    const n = new Notification({
      title: 'Timer done',
      body: `${minutes} min timer finished`,
      silent: alert !== 'sound'
    })
    live.add(n)
    n.on('close', () => live.delete(n))
    n.on('click', () => {
      live.delete(n)
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
