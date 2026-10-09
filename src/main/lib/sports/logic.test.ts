import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import {
  IDLE_INTERVAL,
  LIVE_INTERVAL,
  League,
  MAX_GAMES,
  decorateSports,
  isTeamKey,
  mergeLeagues,
  normalize,
  scheduleLabel,
  sortGames,
  sportsInterval,
  applyFavorite,
  teamColor,
  visibleGames
} from './logic.js'

import { Game } from '../feeds/types.js'

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const nba = normalize('nba', fixture('nba-scoreboard.json'))
const nfl = normalize('nfl', fixture('nfl-scoreboard.json'))

function game(over: Partial<Game> & { id: string }): Game {
  return {
    league: 'nba',
    home: { key: 'nba:AAA', abbr: 'AAA', name: 'A', score: null },
    away: { key: 'nba:BBB', abbr: 'BBB', name: 'B', score: null },
    state: 'pre',
    detail: '',
    start: 0,
    ...over
  }
}

describe('normalize', () => {
  it('maps every fixture event', () => {
    expect(nba).toHaveLength(3)
    expect(nfl).toHaveLength(3)
  })

  it('maps a live game', () => {
    const live = nba.find(g => g.id === 'nba:401700001')
    expect(live).toEqual({
      id: 'nba:401700001',
      league: 'nba',
      home: {
        key: 'nba:BOS',
        abbr: 'BOS',
        name: 'Celtics',
        score: 88,
        logo: 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/bos.png',
        color: '#008348'
      },
      away: {
        key: 'nba:LAL',
        abbr: 'LAL',
        name: 'Lakers',
        score: 84,
        logo: 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/lal.png',
        color: '#552583'
      },
      state: 'in',
      detail: 'Q3 4:12',
      start: Date.parse('2026-10-08T23:00Z')
    })
  })

  it('hides the 0-0 score before a game starts', () => {
    const pre = nfl.find(g => g.state === 'pre')
    expect(pre?.home.score).toBeNull()
    expect(pre?.away.score).toBeNull()
    expect(pre?.detail).toBe('10/8 - 8:20 PM EDT')
  })

  it('keeps final scores', () => {
    const final = nfl.find(g => g.state === 'post')
    expect(final?.home.score).toBe(27)
    expect(final?.away.score).toBe(24)
    expect(final?.detail).toBe('Final')
  })

  it('keeps the NFL week, and quarter and clock for live NFL games', () => {
    const live = nfl.find(g => g.state === 'in')
    expect(live).toMatchObject({ period: 2, clock: 8 * 60 + 3, week: 6 })
    for (const g of nfl.filter(g => g.state !== 'in')) {
      expect(g.week).toBe(6)
      expect(g.period).toBeUndefined()
      expect(g.clock).toBeUndefined()
    }
  })

  it('reads halftime from a real capture as Q2 0:00', () => {
    const games = normalize('nfl', fixture('nfl-live-2.json'))
    const half = games.find(g => g.state === 'in')
    expect(half).toMatchObject({ period: 2, clock: 0, week: 5 })
  })

  it('skips malformed events instead of failing the league', () => {
    const json = {
      events: [
        { id: '1' },
        { id: '2', date: 'nope', competitions: [] },
        ...(fixture('nba-scoreboard.json') as { events: unknown[] }).events
      ]
    }
    expect(normalize('nba', json)).toHaveLength(3)
  })

  it('upper-cases team abbreviations so keys stay valid', () => {
    const json = fixture('nba-scoreboard.json') as {
      events: {
        competitions: {
          competitors: { team: { abbreviation: string } }[]
        }[]
      }[]
    }
    json.events[0].competitions[0].competitors[0].team.abbreviation = 'bos'
    const [first] = normalize('nba', json)
    expect(first.home.key).toBe('nba:BOS')
    expect(isTeamKey(first.home.key)).toBe(true)
  })

  it('survives schema drift: skips bad events, coerces odd fields', () => {
    const games = normalize('nba', fixture('nba-drift.json'))
    expect(games.map(g => g.id)).toEqual(['nba:k1', 'nba:4012'])

    const [odd, scheduled] = games
    // Wrongly typed fields fall back instead of reaching the client.
    expect(odd.home).toEqual({
      key: 'nba:LAL',
      abbr: 'LAL',
      name: 'Los Angeles Lakers',
      score: null
    })
    expect(odd.away).toMatchObject({ name: 'GSW', score: 99 })
    expect(odd.detail).toBe('')
    expect(scheduled).toMatchObject({ state: 'pre', detail: '10/8 - 8:30 PM EDT' })
    expect(scheduled.home.score).toBeNull()

    // Everything the client renders as text is a string.
    for (const g of games)
      for (const value of [g.detail, g.home.name, g.away.name, g.home.abbr])
        expect(typeof value).toBe('string')
  })

  it('throws when the response has no events array', () => {
    expect(() => normalize('nfl', { error: 'x' })).toThrow()
    expect(() => normalize('nfl', null)).toThrow()
  })
})

// Real ESPN responses captured 2026-10-08. Every game is still 'pre', so
// live and final handling is covered by the hand-built fixtures above.
describe('normalize (real ESPN captures)', () => {
  const captures = [
    { league: 'nba' as const, file: 'nba-live.json', count: 6 },
    { league: 'nfl' as const, file: 'nfl-live.json', count: 15 }
  ]

  for (const { league, file, count } of captures) {
    it(`maps every ${league.toUpperCase()} event`, () => {
      const games = normalize(league, fixture(file))
      expect(games).toHaveLength(count)
      for (const g of games) {
        expect(isTeamKey(g.home.key)).toBe(true)
        expect(isTeamKey(g.away.key)).toBe(true)
        expect(g.home.key).not.toBe(g.away.key)
        expect(Number.isNaN(g.start)).toBe(false)
        expect(g.detail).not.toBe('')
        expect(g.state).toBe('pre')
        expect(g.home.score).toBeNull()
        expect(g.away.score).toBeNull()
        expect(g.home.color).toMatch(/^#[0-9a-f]{6}$/)
        expect(g.away.color).toMatch(/^#[0-9a-f]{6}$/)
      }
    })
  }

  it('reads a real game correctly', () => {
    const games = normalize('nba', fixture('nba-live.json'))
    const game = games.find(g => g.id === 'nba:401898392')
    expect(game).toMatchObject({
      league: 'nba',
      home: {
        key: 'nba:CLE',
        abbr: 'CLE',
        name: 'Cavaliers',
        score: null,
        color: '#860038'
      },
      away: { key: 'nba:BOS', abbr: 'BOS', name: 'Celtics', score: null },
      state: 'pre',
      detail: '10/8 - 7:00 PM EDT',
      start: Date.parse('2026-10-08T23:00Z')
    })
  })
})

describe('teamColor', () => {
  it('uses the primary color, normalized to #rrggbb', () => {
    expect(teamColor('860038', 'bc945c')).toBe('#860038')
    expect(teamColor('#ABCDEF', null)).toBe('#abcdef')
  })

  it('swaps a near-black primary for its alternate', () => {
    // Real ESPN values: Bears navy, Spurs black, Nets black/white.
    expect(teamColor('0b1c3a', 'e64100')).toBe('#e64100')
    expect(teamColor('000000', 'c4ced4')).toBe('#c4ced4')
    expect(teamColor('000000', 'ffffff')).toBe('#ffffff')
  })

  it('keeps a near-black primary when the alternate is no better', () => {
    expect(teamColor('000000', '021018')).toBe('#000000')
  })

  it('ignores anything that is not a hex color', () => {
    expect(teamColor('red', 'url(x)')).toBeNull()
    expect(teamColor(undefined, 12)).toBeNull()
    expect(teamColor('zzz', '00338d')).toBe('#00338d')
  })
})

describe('normalize (real ESPN captures, live and final)', () => {
  const captures = [
    { league: 'nba' as const, file: 'nba-live-2.json', count: 6 },
    { league: 'nfl' as const, file: 'nfl-live-2.json', count: 15 }
  ]

  for (const { league, file, count } of captures) {
    it(`maps every ${league.toUpperCase()} event`, () => {
      const raw = fixture(file) as {
        events: {
          id: string
          competitions: { status: { type: { shortDetail: string } } }[]
        }[]
      }
      const games = normalize(league, raw)
      expect(games).toHaveLength(count)
      for (const g of games) {
        const event = raw.events.find(e => `${league}:${e.id}` === g.id)
        expect(g.detail).toBe(
          event?.competitions[0].status.type.shortDetail
        )
        expect(isTeamKey(g.home.key)).toBe(true)
        expect(isTeamKey(g.away.key)).toBe(true)
        expect(g.home.key).not.toBe(g.away.key)
        if (g.state === 'pre') {
          expect(g.home.score).toBeNull()
          expect(g.away.score).toBeNull()
        } else {
          expect(typeof g.home.score).toBe('number')
          expect(typeof g.away.score).toBe('number')
        }
      }
    })
  }

  it('has live and final games', () => {
    const games = [
      ...normalize('nba', fixture('nba-live-2.json')),
      ...normalize('nfl', fixture('nfl-live-2.json'))
    ]
    expect(games.filter(g => g.state === 'in')).toHaveLength(5)
    expect(games.filter(g => g.state === 'post')).toHaveLength(1)
  })

  it('reads a final game correctly', () => {
    const games = normalize('nba', fixture('nba-live-2.json'))
    expect(games.find(g => g.id === 'nba:401898392')).toMatchObject({
      home: { key: 'nba:CLE', score: 113 },
      away: { key: 'nba:BOS', score: 124 },
      state: 'post',
      detail: 'Final'
    })
  })

  it('reads a live game correctly', () => {
    const games = normalize('nfl', fixture('nfl-live-2.json'))
    expect(games.find(g => g.id === 'nfl:401872980')).toMatchObject({
      home: { key: 'nfl:DAL', score: 10 },
      away: { key: 'nfl:TB', score: 7 },
      state: 'in',
      detail: 'Halftime'
    })
  })
})

describe('sortGames', () => {
  const all = [...nba, ...nfl]

  it('orders live, then upcoming by start, then finals', () => {
    const ids = sortGames(all, []).map(g => g.id)
    expect(ids).toEqual([
      'nfl:401800002', // live, 20:25
      'nba:401700001', // live, 23:00
      'nfl:401800003', // pre, 00:20
      'nba:401700002', // pre, 02:30
      'nba:401700003', // final 17:00
      'nfl:401800001' // final 17:00
    ])
  })

  it('puts games with a favorite team first', () => {
    const ids = sortGames(all, ['nfl:BUF', 'nba:DEN']).map(g => g.id)
    expect(ids.slice(0, 2)).toEqual(['nba:401700002', 'nfl:401800001'])
    expect(ids[2]).toBe('nfl:401800002')
  })

  it('does not mutate its input', () => {
    const copy = [...all]
    sortGames(all, ['nfl:BUF'])
    expect(all).toEqual(copy)
  })
})

describe('sportsInterval', () => {
  const now = Date.parse('2026-10-08T12:00Z')

  it('polls fast while a game is live', () => {
    expect(sportsInterval([game({ id: 'a', state: 'in' })], now)).toBe(
      LIVE_INTERVAL
    )
  })

  it('polls fast when a game starts within 10 minutes', () => {
    const soon = game({ id: 'a', start: now + 10 * 60 * 1000 })
    expect(sportsInterval([soon], now)).toBe(LIVE_INTERVAL)
  })

  it('polls fast for a scheduled game past its start time', () => {
    const late = game({ id: 'a', start: now - 60 * 1000 })
    expect(sportsInterval([late], now)).toBe(LIVE_INTERVAL)
  })

  it('polls slowly otherwise', () => {
    const later = game({ id: 'a', start: now + 11 * 60 * 1000 })
    const done = game({ id: 'b', state: 'post', start: now - 1 })
    expect(sportsInterval([later, done], now)).toBe(IDLE_INTERVAL)
    expect(sportsInterval([], now)).toBe(IDLE_INTERVAL)
  })
})

describe('favorites', () => {
  it('validates team keys', () => {
    expect(isTeamKey('nba:BOS')).toBe(true)
    expect(isTeamKey('nfl:SF')).toBe(true)
    expect(isTeamKey('mlb:NYY')).toBe(false)
    expect(isTeamKey('nba:bos')).toBe(false)
    expect(isTeamKey('nba:')).toBe(false)
    expect(isTeamKey(42)).toBe(false)
  })

  it('toggles a key on and off', () => {
    const on = applyFavorite([], 'nba:BOS')
    expect(on).toEqual(['nba:BOS'])
    expect(applyFavorite(on, 'nba:BOS')).toEqual([])
  })

  it('sets an explicit state, so repeats are harmless', () => {
    const on = applyFavorite([], 'nba:BOS', true)
    expect(applyFavorite(on, 'nba:BOS', true)).toBe(on)
    expect(applyFavorite(on, 'nba:BOS', false)).toEqual([])
    expect(applyFavorite([], 'nba:BOS', false)).toEqual([])
  })

  it('decorates a payload with sorted items and favorites', () => {
    const payload = {
      items: [...nba, ...nfl],
      fetchedAt: 1,
      fetchedAtLabel: '12:00',
      stale: false,
      error: null
    }
    const out = decorateSports(payload, ['nba:MIA'], {
      now: Date.parse('2026-10-08T18:00Z'),
      formatTime: () => 'T'
    })
    expect(out.favorites).toEqual(['nba:MIA'])
    expect(out.items[0].id).toBe('nba:401700003')
    expect(out.fetchedAtLabel).toBe('12:00')
  })

  it('sends at most MAX_GAMES, keeping favorites and live games', () => {
    const now = Date.parse('2026-10-08T18:00Z')
    const many = Array.from({ length: 60 }, (_, i) =>
      game({ id: `nba:${i}`, start: now + i * 60_000 })
    )
    const live = game({ id: 'nba:live', state: 'in', start: now + 3600_000 })
    const fav = game({
      id: 'nba:fav',
      start: now + 2 * 3600_000,
      home: { key: 'nba:MIA', abbr: 'MIA', name: 'Heat', score: null }
    })
    const out = decorateSports(
      {
        items: [...many, live, fav],
        fetchedAt: 1,
        fetchedAtLabel: '',
        stale: false,
        error: null
      },
      ['nba:MIA'],
      { now, formatTime: () => 'T' }
    )
    expect(out.items).toHaveLength(MAX_GAMES)
    expect(out.items[0].id).toBe('nba:fav')
    expect(out.items[1].id).toBe('nba:live')
  })

  it('relabels only scheduled games', () => {
    const payload = {
      items: [...nba, ...nfl],
      fetchedAt: 1,
      fetchedAtLabel: '',
      stale: false,
      error: null
    }
    const out = decorateSports(payload, [], {
      now: Date.parse('2026-10-08T18:00Z'),
      formatTime: () => 'T'
    })
    for (const g of out.items) {
      if (g.state === 'pre') expect(g.detail).toMatch(/^(\w{3} )?T$/)
      else expect(g.detail).not.toMatch(/T$/)
    }
    expect(out.items.find(g => g.state === 'post')?.detail).toBe('Final')
  })
})

describe('visibleGames', () => {
  const now = Date.parse('2026-10-08T12:00Z')
  const h = 60 * 60 * 1000

  it('keeps games within 12 hours either side of now', () => {
    const games = [
      game({ id: 'old', state: 'post', start: now - 13 * h }),
      game({ id: 'final', state: 'post', start: now - 11 * h }),
      game({ id: 'soon', start: now + 11 * h }),
      game({ id: 'far', start: now + 13 * h })
    ]
    expect(visibleGames(games, now).map(g => g.id)).toEqual([
      'final',
      'soon'
    ])
  })

  it('always keeps fresh live games', () => {
    const live = game({ id: 'live', state: 'in', start: now - 20 * h })
    expect(visibleGames([live], now)).toHaveLength(1)
  })

  it('drops old live games left over from a failed refresh', () => {
    const leftover = game({
      id: 'x',
      state: 'in',
      start: now - 72 * h,
      stale: true
    })
    expect(visibleGames([leftover], now)).toHaveLength(0)
    expect(sportsInterval([leftover], now)).toBe(IDLE_INTERVAL)
  })

  it('hides the weekend NFL slate from a Thursday capture', () => {
    const nflWeek = normalize('nfl', fixture('nfl-live.json'))
    const thursday = Date.parse('2026-10-08T20:00Z')
    const shown = visibleGames(nflWeek, thursday)
    expect(shown.map(g => g.id)).toEqual(['nfl:401872980'])
  })
})

describe('scheduleLabel', () => {
  // Local-time dates, so the tests hold in any time zone.
  const now = new Date(2026, 9, 8, 12, 0).getTime()
  const fmt = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  it('shows only the time for a game later today', () => {
    expect(
      scheduleLabel(new Date(2026, 9, 8, 19, 0).getTime(), now, fmt)
    ).toBe('19:00')
  })

  it('adds the weekday for another day', () => {
    // 11 Oct 2026 is a Sunday.
    expect(
      scheduleLabel(new Date(2026, 9, 11, 13, 0).getTime(), now, fmt)
    ).toBe('Sun 13:00')
  })

  it('treats just after midnight as the next day', () => {
    expect(
      scheduleLabel(new Date(2026, 9, 9, 0, 15).getTime(), now, fmt)
    ).toBe('Fri 0:15')
  })
})

describe('mergeLeagues', () => {
  it('combines successful leagues and remembers them', () => {
    const lastGood = new Map<League, Game[]>()
    const games = mergeLeagues(
      [
        { league: 'nba', games: nba },
        { league: 'nfl', games: nfl }
      ],
      lastGood
    )
    expect(games).toHaveLength(6)
    expect(games.some(g => g.stale)).toBe(false)
    expect(lastGood.get('nfl')).toBe(nfl)
  })

  it('keeps the failed league from last good data, marked stale', () => {
    const lastGood = new Map<League, Game[]>([['nfl', nfl]])
    const games = mergeLeagues(
      [
        { league: 'nba', games: nba },
        { league: 'nfl', games: null, error: 'timeout' }
      ],
      lastGood
    )
    expect(
      games.filter(g => g.league === 'nba').every(g => !g.stale)
    ).toBe(true)
    expect(games.filter(g => g.league === 'nfl')).toHaveLength(3)
    expect(games.filter(g => g.league === 'nfl').every(g => g.stale)).toBe(
      true
    )
    // The remembered copy stays clean.
    expect(lastGood.get('nfl')?.some(g => g.stale)).toBe(false)
  })

  it('throws when every league failed', () => {
    expect(() =>
      mergeLeagues(
        [
          { league: 'nba', games: null, error: 'a' },
          { league: 'nfl', games: null, error: 'b' }
        ],
        new Map()
      )
    ).toThrow('nba: a; nfl: b')
  })
})
