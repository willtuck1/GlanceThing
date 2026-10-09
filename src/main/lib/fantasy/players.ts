import { PlayerMap, playersFresh, slimPlayers } from './logic.js'

// Retry a failed download no sooner than this, so a broken network doesn't
// pull the ~15 MB file on every refresh.
export const PLAYERS_RETRY_MS = 60 * 60 * 1000
// Same, before any copy exists. Shorter, since the tab can't show names.
export const PLAYERS_FIRST_RETRY_MS = 5 * 60 * 1000

export const PLAYERS_UNAVAILABLE = 'Sleeper player list is not available yet'

export interface PlayersFile {
  fetchedAt: number
  players: PlayerMap
}

export interface PlayerStoreDeps {
  download: () => Promise<unknown>
  read: () => PlayersFile | null
  write: (file: PlayersFile) => void
  now: () => number
  log?: (message: string) => void
}

// The slimmed-down player list, cached to disk and refreshed at most once a
// day. A failed download falls back to the last copy, however old.
export function createPlayerStore(deps: PlayerStoreDeps) {
  let file: PlayersFile | null = null
  let loaded = false
  let lastAttempt = Number.NEGATIVE_INFINITY
  let inFlight: Promise<PlayerMap> | null = null

  function cached() {
    if (!loaded) {
      loaded = true
      const disk = deps.read()
      if (
        disk &&
        typeof disk.fetchedAt === 'number' &&
        typeof disk.players === 'object' &&
        disk.players !== null
      )
        file = disk
    }
    return file
  }

  async function download(): Promise<PlayerMap> {
    lastAttempt = deps.now()
    try {
      const players = slimPlayers(await deps.download())
      if (Object.keys(players).length === 0)
        throw new Error('Sleeper returned an empty player list')
      file = { fetchedAt: deps.now(), players }
      deps.write(file)
      return players
    } catch (e) {
      const old = cached()
      if (old) {
        const msg = e instanceof Error ? e.message : String(e)
        deps.log?.(`Player list download failed, using old copy: ${msg}`)
        return old.players
      }
      throw e
    }
  }

  return async function getPlayers(): Promise<PlayerMap> {
    const current = cached()
    const now = deps.now()
    if (current && playersFresh(current.fetchedAt, now))
      return current.players
    if (current && now - lastAttempt < PLAYERS_RETRY_MS)
      return current.players
    if (!current && !inFlight && now - lastAttempt < PLAYERS_FIRST_RETRY_MS)
      throw new Error(PLAYERS_UNAVAILABLE)
    if (!inFlight)
      inFlight = download().finally(() => {
        inFlight = null
      })
    return inFlight
  }
}
