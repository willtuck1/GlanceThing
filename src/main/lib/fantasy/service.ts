import { getFeed } from '../feeds/registry.js'
import { log, LogLevel } from '../utils.js'
import { LeagueOption, pickLeague } from './logic.js'
import {
  getFantasySettings,
  setFantasyLeague,
  setFantasyUser
} from './settings.js'
import {
  FantasySetupError,
  getLeagues,
  getNflState,
  GetJson,
  lookupUserId,
  sleeperGet
} from './sleeper.js'

// Desktop-app actions for the Fantasy settings. Each change clears the
// cached matchup and refreshes, so the Car Thing never shows the old one.

export type Result<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export interface FantasyStatus {
  username: string | null
  leagueId: string | null
}

export interface LeaguesResult {
  leagues: LeagueOption[]
  leagueId: string | null
  season: string
}

const USERNAME = /^[A-Za-z0-9_.-]{1,40}$/

function errorMessage(e: unknown) {
  if (e instanceof FantasySetupError) return e.message
  return e instanceof Error
    ? `Couldn't reach Sleeper: ${e.message}`
    : String(e)
}

function resetAndRefresh() {
  const feed = getFeed('fantasy')
  feed?.reset()
  void feed?.refresh()
}

export function fantasyStatus(): FantasyStatus {
  const { username, leagueId } = getFantasySettings()
  return { username, leagueId }
}

async function leaguesFor(
  get: GetJson,
  userId: string,
  savedId: string | null
): Promise<LeaguesResult> {
  const state = await getNflState(get)
  const leagues = await getLeagues(get, userId, state.season)
  const leagueId = pickLeague(leagues, savedId)?.id ?? null
  return { leagues, leagueId, season: state.season }
}

// Checks the username with Sleeper, saves it and lists its leagues.
export async function saveUsername(
  raw: unknown,
  get: GetJson = sleeperGet
): Promise<Result<LeaguesResult & { username: string | null }>> {
  const username = typeof raw === 'string' ? raw.trim() : ''

  if (!username) {
    setFantasyUser(null, null)
    setFantasyLeague(null)
    resetAndRefresh()
    return { ok: true, username: null, leagues: [], leagueId: null, season: '' }
  }

  if (!USERNAME.test(username))
    return { ok: false, error: 'That is not a valid Sleeper username.' }

  try {
    const userId = await lookupUserId(get, username)
    const previous = getFantasySettings()
    const sameUser = previous.username?.toLowerCase() === username.toLowerCase()
    const result = await leaguesFor(
      get,
      userId,
      sameUser ? previous.leagueId : null
    )
    setFantasyUser(username, userId)
    setFantasyLeague(result.leagueId)
    resetAndRefresh()
    return { ok: true, username, ...result }
  } catch (e) {
    log(`Sleeper lookup failed: ${errorMessage(e)}`, 'Fantasy', LogLevel.WARN)
    return { ok: false, error: errorMessage(e) }
  }
}

export async function leagues(
  get: GetJson = sleeperGet
): Promise<Result<LeaguesResult>> {
  const { username, userId, leagueId } = getFantasySettings()
  if (!username) return { ok: true, leagues: [], leagueId: null, season: '' }
  try {
    const id = userId ?? (await lookupUserId(get, username))
    return { ok: true, ...(await leaguesFor(get, id, leagueId)) }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

export function saveLeague(id: unknown) {
  if (typeof id !== 'string' || !id) return
  if (id === getFantasySettings().leagueId) return
  setFantasyLeague(id)
  resetAndRefresh()
}
