import { Game, SportsPayload, FeedPayload, Team } from '../feeds/types.js'

export type League = Game['league']

export const LEAGUES: League[] = ['nba', 'nfl']

export const LIVE_INTERVAL = 30 * 1000
export const IDLE_INTERVAL = 5 * 60 * 1000
export const SOON_WINDOW = 10 * 60 * 1000

const TEAM_KEY = /^(nba|nfl):[A-Z0-9]{1,5}$/

export function isTeamKey(value: unknown): value is string {
  return typeof value === 'string' && TEAM_KEY.test(value)
}

// Minimal view of ESPN's scoreboard JSON: only the fields we read.
interface EspnCompetitor {
  homeAway?: string
  score?: string | number
  team?: {
    abbreviation?: string
    shortDisplayName?: string
    displayName?: string
    logo?: string
  }
}

interface EspnEvent {
  id?: string
  date?: string
  competitions?: {
    competitors?: EspnCompetitor[]
    status?: EspnStatus
  }[]
  status?: EspnStatus
}

interface EspnStatus {
  type?: { state?: string; shortDetail?: string }
}

function toTeam(
  league: League,
  c: EspnCompetitor,
  state: Game['state']
): Team | null {
  const abbr = c.team?.abbreviation?.toUpperCase()
  if (!abbr) return null

  const raw = Number(c.score)
  const team: Team = {
    key: `${league}:${abbr}`,
    abbr,
    name: c.team?.shortDisplayName ?? c.team?.displayName ?? abbr,
    // ESPN reports "0" before kickoff; show no score until the game starts.
    score: state === 'pre' || !Number.isFinite(raw) ? null : raw
  }
  if (c.team?.logo) team.logo = c.team.logo
  return team
}

function toState(value: unknown): Game['state'] | null {
  return value === 'pre' || value === 'in' || value === 'post'
    ? value
    : null
}

// Converts an ESPN scoreboard response into Games. Events missing required
// fields are skipped rather than failing the whole league.
export function normalize(league: League, json: unknown): Game[] {
  const events = (json as { events?: unknown })?.events
  if (!Array.isArray(events)) throw new Error(`Bad ${league} scoreboard`)

  const games: Game[] = []

  for (const event of events as EspnEvent[]) {
    const competition = event?.competitions?.[0]
    const status = competition?.status ?? event?.status
    const state = toState(status?.type?.state)
    const start = Date.parse(event?.date ?? '')
    const competitors = competition?.competitors ?? []
    const homeRaw = competitors.find(c => c.homeAway === 'home')
    const awayRaw = competitors.find(c => c.homeAway === 'away')

    if (!event?.id || !state || Number.isNaN(start)) continue
    if (!homeRaw || !awayRaw) continue

    const home = toTeam(league, homeRaw, state)
    const away = toTeam(league, awayRaw, state)
    if (!home || !away) continue

    games.push({
      id: `${league}:${event.id}`,
      league,
      home,
      away,
      state,
      detail: status?.type?.shortDetail ?? '',
      start
    })
  }

  return games
}

const STATE_RANK: Record<Game['state'], number> = { in: 0, pre: 1, post: 2 }

export function hasFavorite(game: Game, favorites: string[]) {
  return (
    favorites.includes(game.home.key) || favorites.includes(game.away.key)
  )
}

// Favorites first, then live, then upcoming by start, then finals.
export function sortGames(games: Game[], favorites: string[]): Game[] {
  return [...games].sort((a, b) => {
    const fav =
      Number(hasFavorite(b, favorites)) - Number(hasFavorite(a, favorites))
    if (fav !== 0) return fav
    const state = STATE_RANK[a.state] - STATE_RANK[b.state]
    if (state !== 0) return state
    if (a.start !== b.start) return a.start - b.start
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

// 30 s while anything is live or about to start, otherwise 5 min.
export function sportsInterval(games: Game[], now: number) {
  const busy = games.some(
    g => g.state === 'in' || (g.state === 'pre' && g.start - now <= SOON_WINDOW)
  )
  return busy ? LIVE_INTERVAL : IDLE_INTERVAL
}

export function toggleFavorite(favorites: string[], teamKey: string) {
  return favorites.includes(teamKey)
    ? favorites.filter(k => k !== teamKey)
    : [...favorites, teamKey]
}

export function decorateSports(
  payload: FeedPayload<Game>,
  favorites: string[]
): SportsPayload {
  return {
    ...payload,
    items: sortGames(payload.items, favorites),
    favorites
  }
}

// Merges per-league results. A league that failed keeps its last good games,
// flagged stale. Throws only when every league failed, so the Feed marks the
// whole payload stale and keeps its cache.
export function mergeLeagues(
  results: { league: League; games: Game[] | null; error?: string }[],
  lastGood: Map<League, Game[]>
): Game[] {
  if (results.every(r => r.games === null)) {
    const reasons = results.map(r => `${r.league}: ${r.error ?? 'failed'}`)
    throw new Error(reasons.join('; '))
  }

  const merged: Game[] = []

  for (const r of results) {
    if (r.games) {
      lastGood.set(r.league, r.games)
      merged.push(...r.games)
    } else {
      const old = lastGood.get(r.league) ?? []
      merged.push(...old.map(g => ({ ...g, stale: true })))
    }
  }

  return merged
}
