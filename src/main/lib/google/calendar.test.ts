import { readFileSync } from 'fs'
import moment from 'moment'
import { afterAll, describe, expect, it, vi } from 'vitest'

import {
  CALENDAR_LIST_URL,
  createCalendarFetcher,
  eventsUrl,
  GetJson,
  listCalendars,
  resolveSelection
} from './calendar.js'
import {
  DEFAULT_COLOR,
  MAX_EVENTS,
  buildCalendarItems,
  dayLabel,
  normalizeCalendarList,
  normalizeEvents
} from './calendarLogic.js'

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const PRIMARY = 'primary-example@example.com'
const FAMILY = 'family0example@group.calendar.google.com'

// Thu 8 Oct 2026, 14:00 in New York.
const NOW = Date.parse('2026-10-08T18:00:00Z')
const formatTime = (ts: number) => moment(ts).format('HH:mm')

const responses: Record<string, unknown> = {
  [CALENDAR_LIST_URL]: fixture('calendar-list.json'),
  [eventsUrl(PRIMARY)]: fixture('events-primary.json'),
  [eventsUrl(FAMILY)]: fixture('events-family.json')
}

function fakeGet(failing: string[] = []) {
  return vi.fn<GetJson>(async url => {
    if (failing.includes(url)) throw new Error('network down')
    if (!(url in responses)) throw new Error(`unexpected ${url}`)
    return responses[url]
  })
}

// Day boundaries are local, so pin a zone that is not UTC. Set at load
// time because some fixtures are normalized while describe blocks run.
vi.stubEnv('TZ', 'America/New_York')
afterAll(() => {
  vi.unstubAllEnvs()
})

describe('normalizeCalendarList', () => {
  it('prefers the user override name and keeps colors', () => {
    const list = normalizeCalendarList(fixture('calendar-list.json'))
    expect(list.map(c => c.name)).toEqual([
      PRIMARY,
      'Home',
      'Holidays in United States'
    ])
    expect(list[0]).toMatchObject({ primary: true, color: '#9fe1e7' })
  })

  it('falls back on odd names and colors', () => {
    const [cal] = normalizeCalendarList({
      items: [
        { id: 'x', summary: 12, backgroundColor: 'url(evil)', primary: 'yes' }
      ]
    })
    expect(cal).toEqual({
      id: 'x',
      name: 'x',
      color: DEFAULT_COLOR,
      primary: false
    })
  })

  it('returns nothing for malformed JSON', () => {
    expect(normalizeCalendarList(null)).toEqual([])
    expect(normalizeCalendarList({ items: 'x' })).toEqual([])
  })
})

describe('normalizeEvents', () => {
  const events = normalizeEvents(fixture('events-primary.json'), {
    id: PRIMARY,
    color: '#123456'
  })

  it('drops cancelled events and prefixes ids with the calendar', () => {
    expect(events.find(e => e.title === 'Cancelled meeting')).toBeUndefined()
    expect(events[0].id).toBe(`${PRIMARY}:conf1`)
  })

  it('reads all-day dates as local midnight', () => {
    const conf = events.find(e => e.title === 'Design conference')!
    expect(conf.allDay).toBe(true)
    expect(new Date(conf.start).toISOString()).toBe(
      '2026-10-07T04:00:00.000Z'
    )
  })

  it('names untitled events', () => {
    expect(events.some(e => e.title === '(No title)')).toBe(true)
  })

  it('never passes non-string fields through', () => {
    const json = {
      items: [
        null,
        { id: 7, start: { dateTime: '2026-10-08T15:00:00Z' } },
        { id: 'a', summary: { text: 'x' }, start: { dateTime: 42 } },
        {
          id: 'b',
          summary: ['Standup'],
          location: { lat: 1 },
          start: { dateTime: '2026-10-08T15:00:00Z' },
          end: { dateTime: 'soon' }
        }
      ]
    }
    const [only, ...rest] = normalizeEvents(json, { id: 'c', color: '#000' })
    expect(rest).toEqual([])
    expect(only).toEqual({
      id: 'c:b',
      title: '(No title)',
      allDay: false,
      start: Date.parse('2026-10-08T15:00:00Z'),
      end: Date.parse('2026-10-08T15:00:00Z'),
      color: '#000'
    })
  })

  it('skips events without a start', () => {
    expect(
      normalizeEvents({ items: [{ id: 'x', summary: 'Broken' }] }, {
        id: 'c',
        color: '#000'
      })
    ).toEqual([])
  })
})

describe('dayLabel', () => {
  it('uses Today, Tomorrow, then a short date', () => {
    const day = 24 * 60 * 60 * 1000
    expect(dayLabel(NOW, NOW)).toBe('Today')
    expect(dayLabel(NOW + day, NOW)).toBe('Tomorrow')
    expect(dayLabel(NOW + 2 * day, NOW)).toBe('Sat 10 Oct')
  })
})

describe('buildCalendarItems', () => {
  it('drops ended events and pins all-day events first in each day', () => {
    const raw = [
      ...normalizeEvents(fixture('events-primary.json'), {
        id: PRIMARY,
        color: '#aaa'
      }),
      ...normalizeEvents(fixture('events-family.json'), {
        id: FAMILY,
        color: '#bbb'
      })
    ]
    const items = buildCalendarItems(raw, NOW, formatTime)

    expect(
      items.map(i => [i.dayLabel, i.title, i.allDay ? 'all day' : i.startLabel])
    ).toEqual([
      ['Today', 'Design conference', 'all day'],
      ['Today', 'Standup', '13:30'],
      ['Today', 'Late call', '23:30'],
      ['Tomorrow', 'Birthday: Sam', 'all day'],
      ['Tomorrow', 'School run', '08:00'],
      ['Tomorrow', 'Dentist', '09:00'],
      ['Sat 10 Oct', '(No title)', '10:00']
    ])

    const dentist = items.find(i => i.title === 'Dentist')!
    expect(dentist).toMatchObject({
      endLabel: '10:00',
      location: '12 Example Street',
      calendarColor: '#aaa'
    })
    const raw1 = raw.find(r => r.title === 'Dentist')!
    expect(dentist.startMs).toBe(raw1.start)
    expect(dentist.endMs).toBe(raw1.end)
    expect(dentist.endMs - dentist.startMs).toBe(60 * 60 * 1000)

    const bday = items.find(i => i.title === 'Birthday: Sam')!
    const rawB = raw.find(r => r.title === 'Birthday: Sam')!
    expect(bday.startMs).toBe(rawB.start)
    expect(bday.endMs).toBe(rawB.end)
    expect(bday.endMs).toBeGreaterThan(bday.startMs)
    expect(items.find(i => i.title === 'School run')!.calendarColor).toBe(
      '#bbb'
    )
  })
})

describe('buildCalendarItems cap', () => {
  it('keeps only the first MAX_EVENTS in display order', () => {
    const raw = Array.from({ length: 100 }, (_, i) => ({
      id: `c:${i}`,
      title: `Event ${i}`,
      allDay: false,
      start: NOW + (100 - i) * 60_000,
      end: NOW + (100 - i) * 60_000 + 30 * 60_000,
      color: '#aaa'
    }))
    const items = buildCalendarItems(raw, NOW, formatTime)
    expect(items).toHaveLength(MAX_EVENTS)
    // The soonest events survive.
    expect(items[0].id).toBe('c:99')
    expect(items[MAX_EVENTS - 1].id).toBe(`c:${100 - MAX_EVENTS}`)
  })
})

describe('resolveSelection', () => {
  const calendars = normalizeCalendarList(fixture('calendar-list.json'))

  it('defaults to the primary calendar', () => {
    expect(resolveSelection(calendars, null).map(c => c.id)).toEqual([
      PRIMARY
    ])
  })

  it('ignores ids that no longer exist', () => {
    expect(
      resolveSelection(calendars, [FAMILY, 'gone@example.com']).map(
        c => c.id
      )
    ).toEqual([FAMILY])
  })
})

describe('listCalendars', () => {
  it('follows nextPageToken', async () => {
    const get = vi.fn<GetJson>(async (_url, params) =>
      params?.pageToken
        ? { items: [{ id: 'b' }] }
        : { items: [{ id: 'a' }], nextPageToken: 'p2' }
    )
    const list = await listCalendars(get)
    expect(list.map(c => c.id)).toEqual(['a', 'b'])
    expect(get).toHaveBeenLastCalledWith(CALENDAR_LIST_URL, {
      pageToken: 'p2'
    })
  })
})

describe('createCalendarFetcher', () => {
  function fetcher(get: GetJson, selected: string[] | null) {
    return createCalendarFetcher({
      get,
      getSelected: () => selected,
      now: () => NOW,
      formatTime
    })
  }

  it('queries each selected calendar for the next 7 days', async () => {
    const get = fakeGet()
    const items = await fetcher(get, [PRIMARY, FAMILY])()

    expect(items).toHaveLength(7)
    expect(get).toHaveBeenCalledWith(eventsUrl(FAMILY), {
      timeMin: '2026-10-08T18:00:00.000Z',
      timeMax: '2026-10-15T18:00:00.000Z',
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250
    })
  })

  it('only fetches the primary calendar by default', async () => {
    const get = fakeGet()
    await fetcher(get, null)()
    expect(get).toHaveBeenCalledTimes(2)
    expect(get).not.toHaveBeenCalledWith(eventsUrl(FAMILY), expect.anything())
  })

  it('fails the whole fetch when one calendar fails', async () => {
    const get = fakeGet([eventsUrl(FAMILY)])
    await expect(fetcher(get, [PRIMARY, FAMILY])()).rejects.toThrow(
      'network down'
    )
  })

  it('returns nothing when no calendar is selected', async () => {
    const get = fakeGet()
    expect(await fetcher(get, [])()).toEqual([])
    expect(get).toHaveBeenCalledTimes(1)
  })
})
