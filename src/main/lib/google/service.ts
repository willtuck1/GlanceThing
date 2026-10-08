import { getFeed } from '../feeds/registry.js'
import { log, LogLevel } from '../utils.js'
import {
  connectGoogle,
  disconnectGoogle,
  getGoogleStatus,
  setGoogleClient
} from './auth.js'
import {
  CalendarOption,
  clearSelectedCalendars,
  getCalendarOptions,
  setSelectedCalendars
} from './calendarSettings.js'

// Desktop-app actions for the Google account. Each one also refreshes the
// calendar feed so the Car Thing reflects the change right away.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function refreshCalendar() {
  void getFeed('calendar')?.refresh()
}

function resetCalendar() {
  getFeed('calendar')?.reset()
  refreshCalendar()
}

export function googleStatus() {
  return getGoogleStatus()
}

export function saveGoogleClient(clientId: string, clientSecret: string) {
  const wasConnected = getGoogleStatus().connected
  setGoogleClient(String(clientId ?? ''), String(clientSecret ?? ''))
  const status = getGoogleStatus()
  if (wasConnected && !status.connected) {
    clearSelectedCalendars()
    resetCalendar()
  }
  return status
}

export async function connect(): Promise<Result> {
  try {
    await connectGoogle()
    refreshCalendar()
    return { ok: true }
  } catch (e) {
    log(`Google connect failed: ${errorMessage(e)}`, 'Google', LogLevel.WARN)
    return { ok: false, error: errorMessage(e) }
  }
}

export async function disconnect() {
  await disconnectGoogle()
  clearSelectedCalendars()
  resetCalendar()
}

export async function calendars(): Promise<
  Result<{ calendars: CalendarOption[] }>
> {
  try {
    return { ok: true, calendars: await getCalendarOptions() }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

export function saveCalendars(ids: unknown) {
  if (!Array.isArray(ids)) return
  setSelectedCalendars(ids.filter((id): id is string => typeof id === 'string'))
  refreshCalendar()
}
