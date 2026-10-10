import { getClockSettings } from '../clock/settings.js'
import { log } from '../utils.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'keylog'

export const hasActions = false

const STRING_FIELDS = ['kind', 'key', 'code']
const NUMBER_FIELDS = ['keyCode', 'dx', 'dy']

/** Keeps only known fields: strings cut to 20 chars, finite numbers. */
export function sanitizeKeyLog(data: unknown): string {
  const d =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const parts: string[] = []
  for (const k of STRING_FIELDS)
    if (typeof d[k] === 'string')
      parts.push(`${k}=${JSON.stringify((d[k] as string).slice(0, 20))}`)
  for (const k of NUMBER_FIELDS)
    if (typeof d[k] === 'number' && Number.isFinite(d[k]))
      parts.push(`${k}=${d[k]}`)
  return parts.join(' ')
}

export const handle: HandlerFunction = async (_ws, data) => {
  if (!getClockSettings().keyDebug) return
  log(sanitizeKeyLog(data), 'Keys')
}
