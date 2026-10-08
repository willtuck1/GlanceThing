import moment from 'moment'

import { CalendarEvent } from '../feeds/types.js'

export const CALENDAR_INTERVAL = 5 * 60 * 1000
export const WINDOW_DAYS = 7
export const DEFAULT_COLOR = '#4285f4'

// Minimal view of Google Calendar's JSON: only the fields we read.
export interface GoogleCalendarListEntry {
  id?: string
  summary?: string
  summaryOverride?: string
  backgroundColor?: string
  primary?: boolean
}

interface GoogleEventTime {
  date?: string
  dateTime?: string
}

interface GoogleEvent {
  id?: string
  status?: string
  summary?: string
  location?: string
  start?: GoogleEventTime
  end?: GoogleEventTime
}

export interface CalendarInfo {
  id: string
  name: string
  color: string
  primary: boolean
}

// An event with real timestamps, before host-side labels are added.
export interface RawEvent {
  id: string
  title: string
  allDay: boolean
  start: number
  end: number
  location?: string
  color: string
}

export function normalizeCalendarList(json: unknown): CalendarInfo[] {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return []

  return (items as GoogleCalendarListEntry[])
    .filter(c => typeof c?.id === 'string' && c.id)
    .map(c => ({
      id: c.id!,
      name: c.summaryOverride || c.summary || c.id!,
      color: c.backgroundColor || DEFAULT_COLOR,
      primary: c.primary === true
    }))
}

// All-day dates are calendar days in the user's zone, so parse them as
// local midnight rather than UTC.
function parseTime(t: GoogleEventTime | undefined) {
  if (t?.dateTime) {
    const ms = Date.parse(t.dateTime)
    return Number.isFinite(ms) ? { ms, allDay: false } : null
  }
  if (t?.date) {
    const m = moment(t.date, 'YYYY-MM-DD', true)
    return m.isValid() ? { ms: m.valueOf(), allDay: true } : null
  }
  return null
}

export function normalizeEvents(
  json: unknown,
  calendar: Pick<CalendarInfo, 'id' | 'color'>
): RawEvent[] {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return []

  const events: RawEvent[] = []
  for (const e of items as GoogleEvent[]) {
    if (!e || typeof e.id !== 'string' || e.status === 'cancelled') continue

    const start = parseTime(e.start)
    const end = parseTime(e.end)
    if (!start) continue

    events.push({
      // Event ids are only unique within a calendar.
      id: `${calendar.id}:${e.id}`,
      title: e.summary?.trim() || '(No title)',
      allDay: start.allDay,
      start: start.ms,
      end: end && end.ms > start.ms ? end.ms : start.ms,
      ...(e.location ? { location: e.location } : {}),
      color: calendar.color
    })
  }
  return events
}

export function dayLabel(day: number, now: number) {
  const diff = moment(day)
    .startOf('day')
    .diff(moment(now).startOf('day'), 'days')
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return moment(day).format('ddd D MMM')
}

// Merges events from all calendars into the tab's list: ended events are
// dropped, events already running show under today, and each day lists
// all-day events first, then by start time.
export function buildCalendarItems(
  events: RawEvent[],
  now: number,
  formatTime: (ts: number) => string
): CalendarEvent[] {
  const today = moment(now).startOf('day').valueOf()

  return events
    .filter(e => e.end > now || (e.end === e.start && e.start >= now))
    .map(e => ({
      e,
      day: Math.max(moment(e.start).startOf('day').valueOf(), today)
    }))
    .sort(
      (a, b) =>
        a.day - b.day ||
        Number(b.e.allDay) - Number(a.e.allDay) ||
        a.e.start - b.e.start ||
        a.e.title.localeCompare(b.e.title)
    )
    .map(({ e, day }) => ({
      id: e.id,
      title: e.title,
      allDay: e.allDay,
      startLabel: e.allDay ? '' : formatTime(e.start),
      endLabel: e.allDay ? '' : formatTime(e.end),
      dayLabel: dayLabel(day, now),
      ...(e.location ? { location: e.location } : {}),
      calendarColor: e.color
    }))
}
