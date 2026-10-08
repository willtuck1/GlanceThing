import { getStorageValue, setStorageValue } from '../storage.js'
import { isTeamKey, toggleFavorite } from './logic.js'

export const FAVORITES_KEY = 'sportsFavorites'

export function getFavorites(): string[] {
  const value = getStorageValue(FAVORITES_KEY)
  return Array.isArray(value) ? value.filter(isTeamKey) : []
}

export function toggleStoredFavorite(teamKey: string) {
  const next = toggleFavorite(getFavorites(), teamKey)
  setStorageValue(FAVORITES_KEY, next)
  return next
}
