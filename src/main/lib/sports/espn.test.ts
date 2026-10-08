import { readFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'

import { SCOREBOARD_URLS, createSportsFetcher } from './espn.js'

import { Game } from '../feeds/types.js'

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const responses: Record<string, unknown> = {
  [SCOREBOARD_URLS.nba]: fixture('nba-scoreboard.json'),
  [SCOREBOARD_URLS.nfl]: fixture('nfl-scoreboard.json')
}

function fakeGet(failing: string[] = []) {
  return vi.fn(async (url: string) => {
    if (failing.includes(url)) throw new Error('network down')
    return responses[url]
  })
}

describe('createSportsFetcher', () => {
  it('fetches both leagues in parallel', async () => {
    const get = fakeGet()
    const games = await createSportsFetcher(get)()
    expect(get).toHaveBeenCalledTimes(2)
    expect(games).toHaveLength(6)
    expect(games.some(g => g.stale)).toBe(false)
  })

  it('marks only the failed league stale, from its last good fetch', async () => {
    let failing: string[] = []
    const get = vi.fn(async (url: string) => fakeGet(failing)(url))
    const fetch = createSportsFetcher(get)

    await fetch()
    failing = [SCOREBOARD_URLS.nfl]
    const games = await fetch()

    const nfl = games.filter(g => g.league === 'nfl')
    const nba = games.filter(g => g.league === 'nba')
    expect(nfl).toHaveLength(3)
    expect(nfl.every(g => g.stale)).toBe(true)
    expect(nba.every(g => !g.stale)).toBe(true)
  })

  it('falls back to cached games after a restart', async () => {
    const cached: Game[] = [
      {
        id: 'nfl:1',
        league: 'nfl',
        home: { key: 'nfl:KC', abbr: 'KC', name: 'Chiefs', score: 7 },
        away: { key: 'nfl:BUF', abbr: 'BUF', name: 'Bills', score: 3 },
        state: 'in',
        detail: '1st',
        start: 0,
        stale: true
      }
    ]
    const fetch = createSportsFetcher(fakeGet([SCOREBOARD_URLS.nfl]), cached)
    const games = await fetch()
    const nfl = games.filter(g => g.league === 'nfl')
    expect(nfl).toEqual([{ ...cached[0], stale: true }])
  })

  it('rejects when both leagues fail so the feed goes stale', async () => {
    const fetch = createSportsFetcher(
      fakeGet([SCOREBOARD_URLS.nba, SCOREBOARD_URLS.nfl])
    )
    await expect(fetch()).rejects.toThrow('nba: network down')
  })

  it('treats a malformed response as a league failure', async () => {
    const get = vi.fn(async (url: string) =>
      url === SCOREBOARD_URLS.nba ? { oops: true } : responses[url]
    )
    const games = await createSportsFetcher(get)()
    expect(games.every(g => g.league === 'nfl')).toBe(true)
  })
})
