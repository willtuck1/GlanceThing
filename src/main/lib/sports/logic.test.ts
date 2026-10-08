import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import {
  IDLE_INTERVAL,
  LIVE_INTERVAL,
  League,
  decorateSports,
  isTeamKey,
  mergeLeagues,
  normalize,
  sortGames,
  sportsInterval,
  toggleFavorite
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
        logo: 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/bos.png'
      },
      away: {
        key: 'nba:LAL',
        abbr: 'LAL',
        name: 'Lakers',
        score: 84,
        logo: 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/lal.png'
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
        competitions: { competitors: { team: { abbreviation: string } }[] }[]
      }[]
    }
    json.events[0].competitions[0].competitors[0].team.abbreviation = 'bos'
    const [first] = normalize('nba', json)
    expect(first.home.key).toBe('nba:BOS')
    expect(isTeamKey(first.home.key)).toBe(true)
  })

  it('throws when the response has no events array', () => {
    expect(() => normalize('nfl', { error: 'x' })).toThrow()
    expect(() => normalize('nfl', null)).toThrow()
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
    const on = toggleFavorite([], 'nba:BOS')
    expect(on).toEqual(['nba:BOS'])
    expect(toggleFavorite(on, 'nba:BOS')).toEqual([])
  })

  it('decorates a payload with sorted items and favorites', () => {
    const payload = {
      items: [...nba, ...nfl],
      fetchedAt: 1,
      fetchedAtLabel: '12:00',
      stale: false,
      error: null
    }
    const out = decorateSports(payload, ['nba:MIA'])
    expect(out.favorites).toEqual(['nba:MIA'])
    expect(out.items[0].id).toBe('nba:401700003')
    expect(out.fetchedAtLabel).toBe('12:00')
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
    expect(games.filter(g => g.league === 'nba').every(g => !g.stale)).toBe(
      true
    )
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
