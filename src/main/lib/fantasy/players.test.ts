import { readFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'

import { PLAYERS_MAX_AGE } from './logic.js'
import {
  createPlayerStore,
  PLAYERS_FIRST_RETRY_MS,
  PLAYERS_RETRY_MS,
  PLAYERS_UNAVAILABLE,
  PlayersFile
} from './players.js'

const raw = JSON.parse(
  readFileSync(
    new URL('./fixtures/players-sample.json', import.meta.url),
    'utf8'
  )
)

function setup(disk: PlayersFile | null = null) {
  let now = 1_000_000
  const state = { disk }
  const download = vi.fn(async () => raw as unknown)
  const store = createPlayerStore({
    download,
    read: () => state.disk,
    write: file => {
      state.disk = file
    },
    now: () => now
  })
  return {
    store,
    download,
    state,
    advance: (ms: number) => {
      now += ms
    }
  }
}

describe('createPlayerStore', () => {
  it('downloads once, saves a slim copy and reuses it for a day', async () => {
    const { store, download, state, advance } = setup()

    const first = await store()
    expect(first['4984']).toEqual({
      name: 'Josh Allen',
      position: 'QB',
      team: 'BUF'
    })
    expect(state.disk?.players['4984']).toEqual(first['4984'])
    // Only the needed fields are kept on disk.
    expect(Object.keys(state.disk?.players['4984'] ?? {})).toEqual([
      'name',
      'position',
      'team'
    ])

    advance(PLAYERS_MAX_AGE - 1)
    await store()
    expect(download).toHaveBeenCalledTimes(1)

    advance(1)
    await store()
    expect(download).toHaveBeenCalledTimes(2)
  })

  it('uses a fresh copy from disk without downloading', async () => {
    const { store, download } = setup({
      fetchedAt: 1_000_000 - 1000,
      players: { 1: { name: 'Disk Player', position: 'RB' } }
    })
    expect((await store())['1'].name).toBe('Disk Player')
    expect(download).not.toHaveBeenCalled()
  })

  it('shares one download between concurrent calls', async () => {
    const { store, download } = setup()
    await Promise.all([store(), store(), store()])
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('falls back to an old copy and waits before retrying', async () => {
    const old = {
      fetchedAt: 1_000_000 - PLAYERS_MAX_AGE,
      players: { 1: { name: 'Old Player', position: 'WR' } }
    }
    const { store, download, advance } = setup(old)
    download.mockRejectedValue(new Error('offline'))

    expect((await store())['1'].name).toBe('Old Player')
    expect(download).toHaveBeenCalledTimes(1)

    advance(PLAYERS_RETRY_MS - 1)
    await store()
    expect(download).toHaveBeenCalledTimes(1)

    advance(1)
    await store()
    expect(download).toHaveBeenCalledTimes(2)
  })

  it('throws without any copy, and retries after a while', async () => {
    const { store, download, advance } = setup()
    download.mockRejectedValueOnce(new Error('offline'))

    await expect(store()).rejects.toThrow('offline')
    await expect(store()).rejects.toThrow(PLAYERS_UNAVAILABLE)
    expect(download).toHaveBeenCalledTimes(1)

    advance(PLAYERS_FIRST_RETRY_MS)
    expect((await store())['4984'].name).toBe('Josh Allen')
  })

  it('rejects an empty list', async () => {
    const { store, download } = setup()
    download.mockResolvedValueOnce({})
    await expect(store()).rejects.toThrow(/empty/)
  })
})
