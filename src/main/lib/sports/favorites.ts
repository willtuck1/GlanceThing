import { getStorageValue, setStorageValue } from '../storage.js'
import { applyFavorite, isTeamKey } from './logic.js'

export const FAVORITES_KEY = 'sportsFavorites'

export function getFavorites(): string[] {
  const value = getStorageValue(FAVORITES_KEY)
  return Array.isArray(value) ? value.filter(isTeamKey) : []
}

export function setStoredFavorite(teamKey: string, on?: boolean) {
  const current = getFavorites()
  const next = applyFavorite(current, teamKey, on)
  if (next !== current) setStorageValue(FAVORITES_KEY, next)
  return next
}
