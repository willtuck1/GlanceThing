import { getStorageValue } from '../storage.js'

export interface CachedItems {
  items: unknown[]
  fetchedAt: number
}

export function loadCache(key: string) {
  return getStorageValue(`feedCache.${key}`) as CachedItems | null
}
