import { getStorageValue, setStorageValue } from '../storage.js'

import { FantasySettings } from './sleeper.js'

// None of these are secrets: Sleeper's API is public and read-only.
export const USERNAME_KEY = 'sleeperUsername'
export const USER_ID_KEY = 'sleeperUserId'
export const LEAGUE_KEY = 'sleeperLeagueId'

function str(key: string) {
  const value = getStorageValue(key)
  return typeof value === 'string' && value ? value : null
}

export function getFantasySettings(): FantasySettings {
  return {
    username: str(USERNAME_KEY),
    userId: str(USER_ID_KEY),
    leagueId: str(LEAGUE_KEY)
  }
}

export function setFantasyUser(username: string | null, userId: string | null) {
  setStorageValue(USERNAME_KEY, username)
  setStorageValue(USER_ID_KEY, userId)
}

export function setFantasyUserId(userId: string) {
  setStorageValue(USER_ID_KEY, userId)
}

export function setFantasyLeague(leagueId: string | null) {
  setStorageValue(LEAGUE_KEY, leagueId)
}
