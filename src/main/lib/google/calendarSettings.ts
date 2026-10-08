import { getStorageValue, setStorageValue } from '../storage.js'
import { googleSession } from './auth.js'
import { GetJson, listCalendars, resolveSelection } from './calendar.js'
import { CalendarInfo } from './calendarLogic.js'

export const SELECTED_CALENDARS_KEY = 'googleCalendars'

export interface CalendarOption extends CalendarInfo {
  selected: boolean
}

export const googleGet: GetJson = async (url, params) => {
  const res = await googleSession.http.get(url, { params })
  return res.data
}

// The saved selection, or null when the user never picked (primary only).
export function getSelectedCalendars(): string[] | null {
  const value = getStorageValue(SELECTED_CALENDARS_KEY)
  if (!Array.isArray(value)) return null
  return value.filter((id): id is string => typeof id === 'string')
}

export function setSelectedCalendars(ids: string[]) {
  const clean = ids.filter(id => typeof id === 'string' && id)
  setStorageValue(SELECTED_CALENDARS_KEY, clean)
}

export function clearSelectedCalendars() {
  setStorageValue(SELECTED_CALENDARS_KEY, null)
}

export async function getCalendarOptions(): Promise<CalendarOption[]> {
  const calendars = await listCalendars(googleGet)
  const selected = new Set(
    resolveSelection(calendars, getSelectedCalendars()).map(c => c.id)
  )
  return calendars.map(c => ({ ...c, selected: selected.has(c.id) }))
}
