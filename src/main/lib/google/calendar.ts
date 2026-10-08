import {
  buildCalendarItems,
  CalendarInfo,
  normalizeCalendarList,
  normalizeEvents,
  RawEvent,
  WINDOW_DAYS
} from './calendarLogic.js'

import { CalendarEvent } from '../feeds/types.js'

const API = 'https://www.googleapis.com/calendar/v3'
export const CALENDAR_LIST_URL = `${API}/users/me/calendarList`
const MAX_PAGES = 5

export type GetJson = (
  url: string,
  params?: Record<string, string | number | boolean>
) => Promise<unknown>

export function eventsUrl(calendarId: string) {
  return `${API}/calendars/${encodeURIComponent(calendarId)}/events`
}

export async function listCalendars(get: GetJson): Promise<CalendarInfo[]> {
  const calendars: CalendarInfo[] = []
  let pageToken: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await get(
      CALENDAR_LIST_URL,
      pageToken ? { pageToken } : undefined
    )
    calendars.push(...normalizeCalendarList(json))
    pageToken = (json as { nextPageToken?: string })?.nextPageToken
    if (!pageToken) break
  }

  return calendars
}

// Ids to fetch: the saved selection (only calendars that still exist), or
// the primary calendar when nothing was chosen yet.
export function resolveSelection(
  calendars: CalendarInfo[],
  selected: string[] | null
) {
  if (selected === null) return calendars.filter(c => c.primary)
  const ids = new Set(selected)
  return calendars.filter(c => ids.has(c.id))
}

export interface CalendarFetcherDeps {
  get: GetJson
  getSelected: () => string[] | null
  now: () => number
  formatTime: (ts: number) => string
}

// Returns a fetch function for the calendar Feed. Any failed request fails
// the whole fetch, so the Feed keeps the last good list and marks it stale.
export function createCalendarFetcher(deps: CalendarFetcherDeps) {
  return async (): Promise<CalendarEvent[]> => {
    const now = deps.now()
    const calendars = resolveSelection(
      await listCalendars(deps.get),
      deps.getSelected()
    )

    const timeMin = new Date(now).toISOString()
    const timeMax = new Date(
      now + WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    const perCalendar = await Promise.all(
      calendars.map(async calendar => {
        const json = await deps.get(eventsUrl(calendar.id), {
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250
        })
        return normalizeEvents(json, calendar)
      })
    )

    const events: RawEvent[] = perCalendar.flat()
    return buildCalendarItems(events, now, deps.formatTime)
  }
}
