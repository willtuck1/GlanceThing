import { setAutoBrightness, setBrightnessSmooth } from '../adb.js'
import { getStorageValue } from '../storage.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'sleep'

export const hasActions = false

export const handle: HandlerFunction = async (ws, data) => {
  const requested = (data as { method?: unknown } | null)?.method
  const sleepMethod =
    requested === 'clock'
      ? 'clock'
      : (getStorageValue('sleepMethod') ?? 'sleep')
  ws.send(
    JSON.stringify({
      type: 'sleep',
      data: sleepMethod
    })
  )

  await setAutoBrightness(null, false)
  if (sleepMethod === 'sleep') {
    await setBrightnessSmooth(null, 0, 10)
  } else if (sleepMethod === 'screensaver') {
    await setBrightnessSmooth(null, 0.1, 10)
  } else if (sleepMethod === 'clock') {
    await setBrightnessSmooth(null, 0.2, 10)
  }
}
