import { describe, expect, it } from 'vitest'

import { burnInOffset, selectWidgets } from './widgets.ts'

const p = (items: unknown[], extra: object = {}) => ({
  items,
  fetchedAt: 1,
  fetchedAtLabel: '',
  stale: false,
  error: null,
  ...extra
})

const weather = {
  kind: 'forecast',
  current: { tempLabel: '72°', label: 'Sunny', code: 0, icon: 'sun' }
}
const ev = (title: string, endMs?: number) => ({
  id: title,
  title,
  allDay: false,
  startLabel: '3:00 PM',
  endLabel: '4:00 PM',
  dayLabel: 'Today',
  calendarColor: '#fff',
  endMs
})
const team = (key: string, score: number) => ({
  key,
  abbr: key.toUpperCase(),
  name: key,
  score
})
const game = (state: string, home: string, away: string) => ({
  id: home + away,
  league: 'nba',
  home: team(home, 100),
  away: team(away, 90),
  state,
  detail: 'Q3 4:12',
  start: 0
})
const fantasy = {
  kind: 'matchup',
  me: { name: 'Me', points: 101.5 },
  opponent: { name: 'Them', points: 88 }
}

describe('selectWidgets', () => {
  const feeds = {
    weather: p([weather]),
    calendar: p([ev('Past', 50), ev('Next', 500), ev('Later', 900)]),
    todo: p([{ done: false }, { done: true }, { done: false }]),
    sports: p([game('post', 'a', 'b'), game('in', 'c', 'd')], {
      favorites: ['d']
    }),
    fantasy: p([fantasy])
  }

  it('keeps the given order', () => {
    const w = selectWidgets(['fantasy', 'weather'], feeds, 100)
    expect(w.map(x => x.id)).toEqual(['fantasy', 'weather'])
    expect(w[0].line1).toBe('101.5 - 88')
    expect(w[1]).toMatchObject({ line1: '72°', line2: 'Sunny' })
  })

  it('picks the next future calendar event by host time', () => {
    expect(selectWidgets(['calendar'], feeds, 100)[0].line1).toBe('Next')
    expect(selectWidgets(['calendar'], feeds, 600)[0].line1).toBe('Later')
    expect(selectWidgets(['calendar'], feeds, 1000)).toEqual([])
  })

  it('skips calendar events without endMs', () => {
    const f = { calendar: p([ev('Old host')]) }
    expect(selectWidgets(['calendar'], f, 0)).toEqual([])
  })

  it('counts open tasks and hides at zero', () => {
    expect(selectWidgets(['todo'], feeds, 0)[0].line1).toBe('2 open')
    expect(
      selectWidgets(['todo'], { todo: p([{ done: true }]) }, 0)
    ).toEqual([])
  })

  it('shows only live favorite games', () => {
    const w = selectWidgets(['sports'], feeds, 0)
    expect(w[0]).toMatchObject({ line1: 'D 90 - 100 C', line2: 'Q3 4:12' })
    const none = {
      sports: p([game('in', 'c', 'd')], { favorites: ['z'] })
    }
    expect(selectWidgets(['sports'], none, 0)).toEqual([])
    const pre = {
      sports: p([game('pre', 'c', 'd')], { favorites: ['d'] })
    }
    expect(selectWidgets(['sports'], pre, 0)).toEqual([])
  })

  it('hides on null, stale, error, empty and kind none', () => {
    const f = {
      weather: null,
      calendar: p([ev('x', 500)], { stale: true }),
      todo: p([{ done: false }], { error: 'boom' }),
      sports: p([]),
      fantasy: p([{ kind: 'none', message: 'bye' }])
    }
    expect(
      selectWidgets(
        ['weather', 'calendar', 'todo', 'sports', 'fantasy', 'nope'],
        f,
        0
      )
    ).toEqual([])
    expect(
      selectWidgets(['weather'], { weather: p([{ kind: 'none' }]) }, 0)
    ).toEqual([])
  })

  it('returns [] for no ids', () => {
    expect(selectWidgets([], feeds, 0)).toEqual([])
  })
})

describe('burnInOffset', () => {
  it('stays in bounds and cycles', () => {
    for (let n = 0; n < 40; n++) {
      const o = burnInOffset(n)
      expect(Math.abs(o.x)).toBeLessThanOrEqual(12)
      expect(Math.abs(o.y)).toBeLessThanOrEqual(8)
    }
    expect(burnInOffset(3)).toEqual(burnInOffset(11))
    expect(
      new Set(
        Array.from({ length: 8 }, (_, n) =>
          JSON.stringify(burnInOffset(n))
        )
      ).size
    ).toBe(8)
  })
})
