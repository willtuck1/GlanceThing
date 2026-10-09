import axios from 'axios'

// Weekly player projections from Sleeper. This endpoint is NOT part of
// Sleeper's documented API (https://docs.sleeper.com) and may change or
// disappear without notice, so everything here fails soft: a failed or
// unreadable response means "no projections", and the Fantasy tab hides its
// projection column instead of breaking.
//
// GET https://api.sleeper.app/projections/nfl/<season>/<week>
//       ?season_type=regular&position[]=<POS>
// → [{ player_id: '4984', stats: { pass_yd: 231.4, pass_td: 1.7, ...,
//      pts_std, pts_half_ppr, pts_ppr }, team, opponent, week, ... }]
// DEF entries use the team abbreviation as player_id ('BUF').
export const PROJECTIONS_BASE = 'https://api.sleeper.app/projections/nfl'

export const PROJECTION_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

// Projections change rarely, so they refresh on their own slower cadence.
export const PROJECTIONS_MAX_AGE = 15 * 60 * 1000
// After a failed download, wait this long before trying again.
export const PROJECTIONS_RETRY_MS = 5 * 60 * 1000

const TIMEOUT = 15_000

export type ProjectionStats = Record<string, number>
// Sleeper player id → projected stat line for the week.
export type ProjectionMap = Record<string, ProjectionStats>
// Stat key → points per unit, from the league's scoring_settings.
export type Scoring = Record<string, number>

export type GetUrl = (url: string) => Promise<unknown>

export const projectionsGet: GetUrl = async url => {
  const res = await axios.get(url, { timeout: TIMEOUT })
  return res.data
}

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function numbers(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, v] of Object.entries(obj(value) ?? {})) {
    const n = num(v)
    if (n !== null) out[key] = n
  }
  return out
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

const enc = encodeURIComponent

export function projectionsUrl(season: string, week: number, position: string) {
  return (
    `${PROJECTIONS_BASE}/${enc(season)}/${enc(String(week))}` +
    `?season_type=regular&position[]=${enc(position)}`
  )
}

// Reads one response. Throws only when it isn't a list at all (the shape
// changed); entries without a player id or stats are skipped. The position
// filter is loose (asking for QB also returns some TEs), so the caller
// merges every position's list by player id.
export function parseProjections(json: unknown): ProjectionMap {
  if (!Array.isArray(json)) throw new Error('Unreadable Sleeper projections')
  const out: ProjectionMap = {}
  for (const value of json) {
    const entry = obj(value)
    const id = entry?.player_id
    const stats = obj(entry?.stats)
    if (typeof id !== 'string' || !id || !stats) continue
    out[id] = numbers(stats)
  }
  return out
}

export function parseScoring(league: unknown): Scoring | null {
  const scoring = numbers(obj(league)?.scoring_settings)
  return Object.keys(scoring).length > 0 ? scoring : null
}

// Which of Sleeper's precomputed totals matches the league's points per
// reception: 1 → PPR, 0.5 → half PPR, otherwise standard.
export function receptionField(scoring: Scoring | null) {
  const rec = scoring?.rec ?? 0
  if (rec >= 1) return 'pts_ppr'
  if (rec >= 0.5) return 'pts_half_ppr'
  return 'pts_std'
}

// Totals that leagues score but projections only carry split up. Each is
// added only when the stat line doesn't have it already.
const DERIVED: Record<string, RegExp> = {
  // Missed field goals: projections have fgmiss_30_39, fgmiss_40_49, ...
  fgmiss: /^fgmiss_/
}

function withDerived(stats: ProjectionStats): ProjectionStats {
  let out = stats
  for (const [key, parts] of Object.entries(DERIVED)) {
    if (stats[key] !== undefined) continue
    let sum = 0
    let found = false
    for (const [k, v] of Object.entries(stats))
      if (parts.test(k)) {
        sum += v
        found = true
      }
    if (found) out = { ...out, [key]: sum }
  }
  return out
}

// Projected fantasy points for one player's stat line.
// Preferred: score the projected stats with the league's own settings,
// Σ stats[key] × scoring_settings[key] over keys both have, so custom
// scoring is reflected. Sleeper's lines carry the position bonuses
// (bonus_rec_te for TE premium, bonus_rec_rb, bonus_rec_wr) and split
// missed field goals by distance, which are summed into fgmiss. If the line
// has no stat the league scores, fall back to Sleeper's pts_ppr /
// pts_half_ppr / pts_std, picked by the league's reception setting. Null
// when neither exists.
export function projectedPoints(
  stats: ProjectionStats | undefined,
  scoring: Scoring | null
): number | null {
  if (!stats) return null
  if (scoring) {
    let total = 0
    let scored = false
    for (const [key, value] of Object.entries(withDerived(stats))) {
      const weight = scoring[key]
      if (weight === undefined) continue
      total += value * weight
      scored = true
    }
    if (scored) return round(total)
  }
  const fallback = stats[receptionField(scoring)]
  return fallback === undefined ? null : round(fallback)
}

// Sleeper teams with a game this week: any projection that names an
// opponent. Teams on bye have none.
export function playingTeams(json: unknown): string[] {
  const teams = new Set<string>()
  for (const value of Array.isArray(json) ? json : []) {
    const entry = obj(value)
    const team = entry?.team
    const opponent = entry?.opponent
    if (typeof team === 'string' && team && typeof opponent === 'string' && opponent)
      teams.add(team)
  }
  return [...teams]
}

// One week's projections.
export interface Projections {
  players: ProjectionMap
  // Sleeper abbreviations of the teams that play this week.
  teams: string[]
}

export interface ProjectionStoreDeps {
  get: GetUrl
  now: () => number
  log?: (message: string) => void
}

interface CachedProjections extends Projections {
  key: string
  fetchedAt: number
  // A partial download is retried sooner than a complete one.
  complete: boolean
}

// Returns a getter for one week's projections, cached in memory on the host
// and refreshed at most every PROJECTIONS_MAX_AGE (PROJECTIONS_RETRY_MS when
// some positions failed). Never throws: when Sleeper fails it returns the
// last good copy for the same week, or null when there is none.
export function createProjectionStore(deps: ProjectionStoreDeps) {
  let cache: CachedProjections | null = null
  // Per season and week, so one week's failure or download never answers
  // for another.
  const lastFailure = new Map<string, number>()
  const inFlight = new Map<string, Promise<Projections | null>>()

  function cached(key: string): Projections | null {
    return cache?.key === key ? { players: cache.players, teams: cache.teams } : null
  }

  async function download(key: string, season: string, week: number) {
    const results = await Promise.allSettled(
      PROJECTION_POSITIONS.map(async pos => {
        const json = await deps.get(projectionsUrl(season, week, pos))
        return { players: parseProjections(json), teams: playingTeams(json) }
      })
    )

    const failed = results.filter(r => r.status === 'rejected')
    for (const r of failed)
      deps.log?.(`Sleeper projections failed: ${String(r.reason)}`)

    const old = cached(key)
    if (failed.length > 0) lastFailure.set(key, deps.now())
    if (failed.length === results.length) return old

    // A position that failed keeps its old entries for this week.
    const players: ProjectionMap = { ...(old?.players ?? {}) }
    const teams = new Set(old?.teams ?? [])
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      Object.assign(players, r.value.players)
      r.value.teams.forEach(t => teams.add(t))
    }

    cache = {
      key,
      players,
      teams: [...teams],
      fetchedAt: deps.now(),
      complete: failed.length === 0
    }
    return cached(key)
  }

  return async function getProjections(
    season: string,
    week: number
  ): Promise<Projections | null> {
    const key = `${season}:${week}`
    const now = deps.now()
    const current = cached(key)
    const maxAge = cache?.complete ? PROJECTIONS_MAX_AGE : PROJECTIONS_RETRY_MS
    if (current && now - (cache as CachedProjections).fetchedAt < maxAge)
      return current
    const failedAt = lastFailure.get(key) ?? Number.NEGATIVE_INFINITY
    if (now - failedAt < PROJECTIONS_RETRY_MS) return current
    let pending = inFlight.get(key)
    if (!pending) {
      pending = download(key, season, week)
        .catch(() => current)
        .finally(() => inFlight.delete(key))
      inFlight.set(key, pending)
    }
    return pending
  }
}
