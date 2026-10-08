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
import {
  clearSelectedTaskList,
  getTaskListOptions,
  setSelectedTaskList,
  TaskListOption
} from './tasksSettings.js'

import { FeedKey } from '../feeds/types.js'

// Desktop-app actions for the Google account. Each one also refreshes the
// Google feeds so the Car Thing reflects the change right away.

export type Result<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

const GOOGLE_FEEDS: FeedKey[] = ['calendar', 'todo']

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function refresh(key: FeedKey) {
  void getFeed(key)?.refresh()
}

// Drops cached data (memory and storage.json) before refreshing, so
// nothing from the old account or list stays on the device.
function resetAndRefresh(key: FeedKey) {
  getFeed(key)?.reset()
  refresh(key)
}

// The account is gone: forget its choices and everything cached from it.
function forgetAccount() {
  clearSelectedCalendars()
  clearSelectedTaskList()
  GOOGLE_FEEDS.forEach(resetAndRefresh)
}

export function googleStatus() {
  return getGoogleStatus()
}

export function saveGoogleClient(clientId: string, clientSecret: string) {
  const wasConnected = getGoogleStatus().connected
  setGoogleClient(String(clientId ?? ''), String(clientSecret ?? ''))
  const status = getGoogleStatus()
  if (wasConnected && !status.connected) forgetAccount()
  return status
}

export async function connect(): Promise<Result> {
  try {
    await connectGoogle()
    GOOGLE_FEEDS.forEach(refresh)
    return { ok: true }
  } catch (e) {
    log(
      `Google connect failed: ${errorMessage(e)}`,
      'Google',
      LogLevel.WARN
    )
    return { ok: false, error: errorMessage(e) }
  }
}

export async function disconnect() {
  await disconnectGoogle()
  forgetAccount()
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
  setSelectedCalendars(
    ids.filter((id): id is string => typeof id === 'string')
  )
  refresh('calendar')
}

export async function taskLists(): Promise<
  Result<{ taskLists: TaskListOption[] }>
> {
  try {
    return { ok: true, taskLists: await getTaskListOptions() }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

// Switching lists clears the old list's tasks so they never show under
// the new one.
export function saveTaskList(id: unknown) {
  if (typeof id !== 'string' || !id) return
  setSelectedTaskList(id)
  resetAndRefresh('todo')
}
