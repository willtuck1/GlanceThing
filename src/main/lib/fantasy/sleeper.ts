import axios from 'axios'

import { describeFetchError, FeedError } from '../feeds/errors.js'
import {
  buildView,
  leagueNotice,
  LeagueOption,
  parseLeagues,
  parseState,
  pickLeague,
  PlayerMap,
  seasonNotice
} from './logic.js'

import { FantasyView } from '../feeds/types.js'

// Sleeper's public, read-only API. No account or token is involved.
// https://docs.sleeper.com
export const SLEEPER_BASE = 'https://api.sleeper.app/v1'

const TIMEOUT = 15_000
// The player list is large; give it longer.
const PLAYERS_TIMEOUT = 60_000

export type GetJson = (path: string) => Promise<unknown>

export const sleeperGet: GetJson = async path => {
  const res = await axios.get(`${SLEEPER_BASE}${path}`, {
    timeout: path === '/players/nfl' ? PLAYERS_TIMEOUT : TIMEOUT
  })
  return res.data
}

// A problem the user fixes in the desktop app, not by waiting. The feed
// forgets its data so another account's matchup never shows.
export class FantasySetupError extends Error {}

export const NOT_CONFIGURED =
  'Enter your Sleeper username in the desktop app (Settings → Fantasy)'

export function userNotFound(username: string) {
  return `Sleeper user "${username}" was not found. Check the username in the desktop app`
}

export function describeFantasyError(e: unknown): FeedError {
  if (e instanceof FantasySetupError)
    return { message: e.message, dropItems: true }
  return describeFetchError(e, 'Sleeper')
}

const enc = encodeURIComponent

export async function lookupUserId(get: GetJson, username: string) {
  const user = (await get(`/user/${enc(username)}`)) as {
    user_id?: unknown
  } | null
  // Sleeper answers an unknown username with 200 and `null`.
  const id = user?.user_id
  if (typeof id !== 'string' || !id)
    throw new FantasySetupError(userNotFound(username))
  return id
}

export async function getNflState(get: GetJson) {
  const state = parseState(await get('/state/nfl'))
  if (!state) throw new Error('Sleeper sent an unreadable NFL state')
  return state
}

export async function getLeagues(
  get: GetJson,
  userId: string,
  season: string
): Promise<LeagueOption[]> {
  return parseLeagues(
    await get(`/user/${enc(userId)}/leagues/nfl/${enc(season)}`)
  )
}

export interface FantasySettings {
  username: string | null
  userId: string | null
  leagueId: string | null
}

export interface FantasyFetcherDeps {
  get: GetJson
  getSettings: () => FantasySettings
  // Remembers the id a username resolved to, so it is looked up once.
  saveUserId: (userId: string) => void
  getPlayers: () => Promise<PlayerMap>
}

// Returns a fetch function for the fantasy Feed. Its one item is this
// week's matchup, or a notice saying why there is none.
export function createFantasyFetcher(deps: FantasyFetcherDeps) {
  return async (): Promise<FantasyView[]> => {
    const settings = deps.getSettings()
    if (!settings.username) throw new FantasySetupError(NOT_CONFIGURED)

    let userId = settings.userId
    if (!userId) {
      userId = await lookupUserId(deps.get, settings.username)
      deps.saveUserId(userId)
    }

    const state = await getNflState(deps.get)
    const offseason = seasonNotice(state)
    if (offseason) return [{ kind: 'none', message: offseason }]

    const leagues = await getLeagues(deps.get, userId, state.season)
    const choice = pickLeague(leagues, settings.leagueId)
    if (!choice)
      return [
        {
          kind: 'none',
          message: `No Sleeper leagues found for the ${state.season} season.`
        }
      ]

    const id = enc(choice.id)
    const [league, rosters, users, matchups] = await Promise.all([
      deps.get(`/league/${id}`),
      deps.get(`/league/${id}/rosters`),
      deps.get(`/league/${id}/users`),
      deps.get(`/league/${id}/matchups/${state.week}`)
    ])

    const notice = leagueNotice(league)
    if (notice)
      return [
        {
          kind: 'none',
          leagueName: choice.name,
          week: state.week,
          message: notice
        }
      ]

    return [
      buildView({
        userId,
        league,
        rosters,
        users,
        matchups,
        players: await deps.getPlayers(),
        week: state.week
      })
    ]
  }
}
