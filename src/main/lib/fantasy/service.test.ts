import { readFileSync } from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
const stored = vi.hoisted(() => ({
  username: null as string | null,
  userId: null as string | null,
  leagueId: null as string | null
}))

vi.mock('../utils.js', () => ({ log: () => {}, LogLevel: { WARN: 2 } }))
vi.mock('./settings.js', () => ({
  getFantasySettings: () => ({ ...stored }),
  setFantasyUser: (username: string | null, userId: string | null) => {
    stored.username = username
    stored.userId = userId
  },
  setFantasyLeague: (id: string | null) => {
    stored.leagueId = id
    calls.push(`league ${id}`)
  }
}))
vi.mock('../feeds/registry.js', () => ({
  getFeed: (key: string) => ({
    reset: () => calls.push(`reset ${key}`),
    refresh: async () => {
      calls.push(`refresh ${key}`)
    }
  })
}))

const service = await import('./service.js')

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const USER_ID = '900000000000000001'

const get = vi.fn(async (path: string): Promise<unknown> => {
  if (path === '/user/samplemanager') return fixture('user.json')
  if (path === '/state/nfl') return fixture('state-regular.json')
  if (path === `/user/${USER_ID}/leagues/nfl/2026`)
    return fixture('leagues.json')
  return null
})

beforeEach(() => {
  calls.length = 0
  stored.username = null
  stored.userId = null
  stored.leagueId = null
  get.mockClear()
})

describe('saveUsername', () => {
  it('checks the user, saves it, lists leagues and refreshes', async () => {
    const res = await service.saveUsername(' samplemanager ', get)
    expect(res).toEqual({
      ok: true,
      username: 'samplemanager',
      season: '2026',
      leagueId: '910000000000000001',
      leagues: [
        { id: '910000000000000001', name: 'Sample Dynasty League' },
        { id: '910000000000000002', name: 'Sample Redraft League' }
      ]
    })
    expect(stored).toEqual({
      username: 'samplemanager',
      userId: USER_ID,
      leagueId: '910000000000000001'
    })
    expect(calls).toEqual([
      'league 910000000000000001',
      'reset fantasy',
      'refresh fantasy'
    ])
  })

  it('keeps the chosen league when re-saving the same user', async () => {
    stored.username = 'SampleManager'
    stored.leagueId = '910000000000000002'
    const res = await service.saveUsername('samplemanager', get)
    expect(res.ok && res.leagueId).toBe('910000000000000002')
  })

  it('reports an unknown user without saving it', async () => {
    const res = await service.saveUsername('nobody', get)
    expect(res).toEqual({
      ok: false,
      error: expect.stringMatching(/"nobody" was not found/)
    })
    expect(stored.username).toBeNull()
    expect(calls).toEqual([])
  })

  it('rejects malformed usernames without calling Sleeper', async () => {
    const res = await service.saveUsername('a/b?c', get)
    expect(res.ok).toBe(false)
    expect(get).not.toHaveBeenCalled()
  })

  it('clears everything for an empty username', async () => {
    stored.username = 'samplemanager'
    stored.userId = USER_ID
    stored.leagueId = 'x'
    const res = await service.saveUsername('  ', get)
    expect(res).toMatchObject({ ok: true, username: null })
    expect(stored).toEqual({ username: null, userId: null, leagueId: null })
    expect(calls).toContain('reset fantasy')
  })

  it('reports network failures', async () => {
    const res = await service.saveUsername('samplemanager', async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    })
    expect(res).toEqual({
      ok: false,
      error: "Couldn't reach Sleeper: getaddrinfo ENOTFOUND"
    })
  })
})

describe('saveLeague', () => {
  it('saves a new league and refreshes', () => {
    service.saveLeague('910000000000000002')
    expect(stored.leagueId).toBe('910000000000000002')
    expect(calls).toEqual([
      'league 910000000000000002',
      'reset fantasy',
      'refresh fantasy'
    ])
  })

  it('ignores the current league and junk', () => {
    stored.leagueId = 'same'
    service.saveLeague('same')
    service.saveLeague(42)
    service.saveLeague('')
    expect(calls).toEqual([])
  })
})
