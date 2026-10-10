import { performance } from 'perf_hooks'

import { serverManager } from '../server.js'
import { setAutoBrightness, setBrightnessSmooth } from '../adb.js'
import { log, LogLevel } from '../../lib/utils.js'
import { getStorageValue } from '../storage.js'
import {
  getLastAlert,
  getLastMinutes,
  setLastAlert,
  setLastMinutes
} from './settings.js'
import {
  closeTimerNotification,
  showTimerNotification
} from './desktopAlert.js'
import { createTimer } from './timer.js'

type Timer = ReturnType<typeof createTimer>

/** Lights up a sleeping screen, the way wake does, plus a visible fallback. */
async function lightUpDevice() {
  if (!serverManager.hasClient()) return
  try {
    if (getStorageValue('autoBrightness') === true)
      await setAutoBrightness(null, true)
    else await setBrightnessSmooth(null, 0.5, 3)
  } catch (e) {
    log(`Could not wake device: ${String(e)}`, 'Timer', LogLevel.WARN)
  }
}

let timer: Timer | null = null

/** Created on first use, never at module load. */
export function getTimer(): Timer {
  timer ??= createTimer({
    now: () => performance.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: h => clearTimeout(h as NodeJS.Timeout),
    broadcast: p => {
      if (p.state !== 'ringing') closeTimerNotification()
      serverManager.broadcast('timer', p)
    },
    desktopAlert: (a, d) => {
      showTimerNotification(a, d, () => getTimer().dismiss())
      void lightUpDevice()
    },
    getLastAlert,
    setLastAlert,
    getLastMinutes,
    setLastMinutes
  })
  return timer
}
