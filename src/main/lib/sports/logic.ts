import { Game, SportsPayload, FeedPayload, Team } from '../feeds/types.js'

export type League = Game['league']

export const LEAGUES: League[] = ['nba', 'nfl']

export const LIVE_INTERVAL = 30 * 1000
export const IDLE_INTERVAL = 5 * 60 * 1000
export const SOON_WINDOW = 10 * 60 * 1000
// Most games sent to the device; more is slow to render on the Car Thing.
export const MAX_GAMES = 40
// Games shown: anything live, plus games starting within this window on
// either side of now (recent finals and the next few hours).
export const SHOW_WINDOW = 12 * 60 * 60 * 1000

const TEAM_KEY = /^(nba|nfl):[A-Z0-9]{1,5}$/

export function isTeamKey(value: unknown): value is string {
  return typeof value === 'string' && TEAM_KEY.test(value)
}

// ESPN's scoreboard JSON is undocumented and changes without notice, so
// every field is read as unknown and checked before use.

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

const HEX = /^#?([0-9a-f]{6})$/i

function hexColor(value: unknown): string | null {
  const m = typeof value === 'string' ? HEX.exec(value.trim()) : null
  return m ? `#${m[1].toLowerCase()}` : null
}

function isNearBlack(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = n >> 16
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return 0.299 * r + 0.587 * g + 0.114 * b < 40
}

// The team's primary color for the row background. A near-black primary
// would vanish on the dark screen, so its alternate color is used instead
// when that one isn't near-black too.
export function teamColor(primary: unknown, alternate: unknown) {
  const main = hexColor(primary)
  const alt = hexColor(alternate)
  if (main && isNearBlack(main) && alt && !isNearBlack(alt)) return alt
  return main ?? alt
}

function toTeam(
  league: League,
  raw: Record<string, unknown>,
  state: Game['state']
): Team | null {
  const info = obj(raw.team)
  const abbr = text(info?.abbreviation)?.toUpperCase()
  if (!abbr || !isTeamKey(`${league}:${abbr}`)) return null

  const score = Number(
    typeof raw.score === 'string' || typeof raw.score === 'number'
      ? raw.score
      : NaN
  )
  const team: Team = {
    key: `${league}:${abbr}`,
    abbr,
    name:
      text(info?.shortDisplayName) ?? text(info?.displayName) ?? abbr,
    // ESPN reports "0" before kickoff; show no score until the game starts.
    score: state === 'pre' || !Number.isFinite(score) ? null : score
  }
  const logo = text(info?.logo)
  if (logo) team.logo = logo
  const color = teamColor(info?.color, info?.alternateColor)
  if (color) team.color = color
  return team
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const CLOCK = /^(\d{1,2}):(\d{2})$/

function clockSeconds(value: unknown): number | null {
  const m = typeof value === 'string' ? CLOCK.exec(value.trim()) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function toState(value: unknown): Game['state'] | null {
  return value === 'pre' || value === 'in' || value === 'post'
    ? value
    : null
}

function toGame(
  league: League,
  raw: unknown,
  week: number | null
): Game | null {
  const event = obj(raw)
  const id =
    typeof event?.id === 'number' ? String(event.id) : text(event?.id)
  if (!event || !id) return null

  const competition = obj(list(event.competitions)[0])
  const status = obj(competition?.status) ?? obj(event.status)
  const statusType = obj(status?.type)
  const state = toState(statusType?.state)
  const start = Date.parse(text(event.date) ?? '')
  if (!state || Number.isNaN(start)) return null

  const competitors = list(competition?.competitors)
    .map(obj)
    .filter(c => c !== null)
  const homeRaw = competitors.find(c => c.homeAway === 'home')
  const awayRaw = competitors.find(c => c.homeAway === 'away')
  if (!homeRaw || !awayRaw) return null

  const home = toTeam(league, homeRaw, state)
  const away = toTeam(league, awayRaw, state)
  if (!home || !away) return null

  const game: Game = {
    id: `${league}:${id}`,
    league,
    home,
    away,
    state,
    detail: text(statusType?.shortDetail) ?? '',
    start
  }
  // NFL only: quarter and seconds left in it, for the Fantasy tab's
  // estimate. displayClock ("4:12") is what ESPN shows; clock is a fallback.
  const period = num(status?.period)
  const clock = clockSeconds(status?.displayClock) ?? num(status?.clock)
  if (
    league === 'nfl' &&
    state === 'in' &&
    period !== null &&
    clock !== null
  ) {
    game.period = period
    game.clock = clock
  }
  if (week !== null) game.week = week
  return game
}

// Converts an ESPN scoreboard response into Games. Events missing required
// fields are skipped rather than failing the whole league; only a response
// with no events array at all counts as a failed fetch.
export function normalize(league: League, json: unknown): Game[] {
  const events = obj(json)?.events
  if (!Array.isArray(events)) throw new Error(`Bad ${league} scoreboard`)

  const week = num(obj(obj(json)?.week)?.number)
  const games: Game[] = []
  for (const event of events) {
    const game = toGame(league, event, week)
    if (game) games.push(game)
  }
  return games
}

const STATE_RANK: Record<Game['state'], number> = {
  in: 0,
  pre: 1,
  post: 2
}

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

// Live games always show unless they come from a failed refresh; stale
// leftovers fall back to the time window like everything else.
export function visibleGames(games: Game[], now: number) {
  return games.filter(
    g =>
      (g.state === 'in' && !g.stale) ||
      Math.abs(g.start - now) <= SHOW_WINDOW
  )
}

// 30 s while anything shown is live or about to start, otherwise 5 min.
export function sportsInterval(games: Game[], now: number) {
  const busy = visibleGames(games, now).some(
    g =>
      g.state === 'in' ||
      (g.state === 'pre' && g.start - now <= SOON_WINDOW)
  )
  return busy ? LIVE_INTERVAL : IDLE_INTERVAL
}

// Sets a favorite on or off. Without `on` it toggles (older clients).
export function applyFavorite(
  favorites: string[],
  teamKey: string,
  on?: boolean
) {
  const has = favorites.includes(teamKey)
  const want = on ?? !has
  if (want === has) return favorites
  return want
    ? [...favorites, teamKey]
    : favorites.filter(k => k !== teamKey)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function sameLocalDay(a: number, b: number) {
  const x = new Date(a)
  const y = new Date(b)
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  )
}

// Short label for a scheduled game, in the host's local time: "7:00 PM"
// today, "Sun 1:00 PM" on later days. ESPN's own label carries the date and
// time zone ("10/8 - 7:00 PM EDT").
export function scheduleLabel(
  start: number,
  now: number,
  formatTime: (ts: number) => string
) {
  const time = formatTime(start)
  if (sameLocalDay(start, now)) return time
  return `${WEEKDAYS[new Date(start).getDay()]} ${time}`
}

export interface DecorateOptions {
  now: number
  formatTime: (ts: number) => string
}

export function decorateSports(
  payload: FeedPayload<Game>,
  favorites: string[],
  { now, formatTime }: DecorateOptions
): SportsPayload {
  const items = visibleGames(payload.items, now).map(g =>
    g.state === 'pre'
      ? { ...g, detail: scheduleLabel(g.start, now, formatTime) }
      : g
  )
  return {
    ...payload,
    // Capped after sorting, so favorites and live games always make it.
    items: sortGames(items, favorites).slice(0, MAX_GAMES),
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
