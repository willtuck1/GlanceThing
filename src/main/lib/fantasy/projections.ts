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

// Projected fantasy points for one player's stat line.
// Preferred: score the projected stats with the league's own settings,
// Σ stats[key] × scoring_settings[key] over keys both have, so custom
// scoring (TE premium, 6-pt passing TDs, ...) is reflected. If the line has
// no stat the league scores, fall back to Sleeper's pts_ppr / pts_half_ppr /
// pts_std, picked by the league's reception setting. Null when neither
// exists.
export function projectedPoints(
  stats: ProjectionStats | undefined,
  scoring: Scoring | null
): number | null {
  if (!stats) return null
  if (scoring) {
    let total = 0
    let scored = false
    for (const [key, value] of Object.entries(stats)) {
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

export interface ProjectionStoreDeps {
  get: GetUrl
  now: () => number
  log?: (message: string) => void
}

interface CachedProjections {
  season: string
  week: number
  fetchedAt: number
  map: ProjectionMap
}

// Returns a getter for one week's projections, cached in memory on the host
// and refreshed at most every PROJECTIONS_MAX_AGE. Never throws: when
// Sleeper fails it returns the last good copy for the same week, or null
// when there is none.
export function createProjectionStore(deps: ProjectionStoreDeps) {
  let cache: CachedProjections | null = null
  let lastFailure = Number.NEGATIVE_INFINITY
  let inFlight: Promise<ProjectionMap | null> | null = null

  function sameWeek(season: string, week: number) {
    return cache !== null && cache.season === season && cache.week === week
  }

  async function download(season: string, week: number) {
    const results = await Promise.allSettled(
      PROJECTION_POSITIONS.map(async pos =>
        parseProjections(await deps.get(projectionsUrl(season, week, pos)))
      )
    )

    const failed = results.filter(r => r.status === 'rejected')
    for (const r of failed)
      deps.log?.(`Sleeper projections failed: ${String(r.reason)}`)

    const old = sameWeek(season, week) ? cache : null
    if (failed.length === results.length) {
      lastFailure = deps.now()
      return old?.map ?? null
    }

    // A position that failed keeps its old entries for this week.
    const map: ProjectionMap = { ...(old?.map ?? {}) }
    for (const r of results)
      if (r.status === 'fulfilled') Object.assign(map, r.value)

    cache = { season, week, fetchedAt: deps.now(), map }
    if (failed.length > 0) lastFailure = deps.now()
    return map
  }

  return async function getProjections(
    season: string,
    week: number
  ): Promise<ProjectionMap | null> {
    const now = deps.now()
    const current = sameWeek(season, week) ? cache : null
    if (current && now - current.fetchedAt < PROJECTIONS_MAX_AGE)
      return current.map
    if (now - lastFailure < PROJECTIONS_RETRY_MS) return current?.map ?? null
    if (!inFlight)
      inFlight = download(season, week)
        .catch(() => current?.map ?? null)
        .finally(() => {
          inFlight = null
        })
    return inFlight
  }
}
