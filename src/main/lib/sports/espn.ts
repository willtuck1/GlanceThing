import axios from 'axios'

import { LEAGUES, League, mergeLeagues, normalize } from './logic.js'

import { Game } from '../feeds/types.js'

const BASE = 'https://site.api.espn.com/apis/site/v2/sports'

export const SCOREBOARD_URLS: Record<League, string> = {
  nba: `${BASE}/basketball/nba/scoreboard`,
  nfl: `${BASE}/football/nfl/scoreboard`
}

const TIMEOUT = 10_000

export async function getJson(url: string): Promise<unknown> {
  const res = await axios.get(url, { timeout: TIMEOUT })
  return res.data
}

// Returns a fetch function for the sports Feed. Leagues are fetched in
// parallel; one failing keeps its last good games, marked stale. `initial`
// seeds that memory from the feed cache so a restart still has a fallback.
export function createSportsFetcher(
  get: (url: string) => Promise<unknown> = getJson,
  initial: Game[] = []
) {
  const lastGood = new Map<League, Game[]>()

  for (const league of LEAGUES) {
    const games = initial
      .filter(g => g.league === league)
      .map(g => {
        const clean = { ...g }
        delete clean.stale
        return clean
      })
    if (games.length > 0) lastGood.set(league, games)
  }

  return async (): Promise<Game[]> => {
    const results = await Promise.all(
      LEAGUES.map(async league => {
        try {
          const json = await get(SCOREBOARD_URLS[league])
          return { league, games: normalize(league, json) }
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          return { league, games: null, error }
        }
      })
    )

    return mergeLeagues(results, lastGood)
  }
}
