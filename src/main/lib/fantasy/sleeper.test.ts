import { readFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'

import { slimPlayers } from './logic.js'
import {
  createFantasyFetcher,
  describeFantasyError,
  FantasyFetcherDeps,
  FantasySettings,
  NOT_CONFIGURED,
  userNotFound
} from './sleeper.js'

import { OFFLINE } from '../feeds/errors.js'

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const USER_ID = '900000000000000001'
const LEAGUE = '910000000000000001'

// Mocked Sleeper API: path → fixture. Unknown paths fail like a 404.
function api(over: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '/user/samplemanager': fixture('user.json'),
    '/state/nfl': fixture('state-regular.json'),
    [`/user/${USER_ID}/leagues/nfl/2026`]: fixture('leagues.json'),
    [`/league/${LEAGUE}`]: fixture('league.json'),
    [`/league/${LEAGUE}/rosters`]: fixture('rosters.json'),
    [`/league/${LEAGUE}/users`]: fixture('users.json'),
    [`/league/${LEAGUE}/matchups/5`]: fixture('matchups-week5.json'),
    ...over
  }
  return vi.fn(async (path: string) => {
    if (!(path in routes))
      throw Object.assign(new Error('404'), { response: { status: 404 } })
    return routes[path]
  })
}

function fetcher(
  get: ReturnType<typeof api>,
  settings: Partial<FantasySettings> = {},
  getProjections?: FantasyFetcherDeps['getProjections']
) {
  const saveUserId = vi.fn()
  const fetch = createFantasyFetcher({
    getProjections,
    get,
    getSettings: () => ({
      username: 'samplemanager',
      userId: null,
      leagueId: null,
      ...settings
    }),
    saveUserId,
    getPlayers: async () => slimPlayers(fixture('players-sample.json'))
  })
  return { fetch, saveUserId }
}

describe('createFantasyFetcher', () => {
  it('follows user → state → leagues → league → matchups', async () => {
    const get = api()
    const { fetch, saveUserId } = fetcher(get)

    const [view] = await fetch()

    expect(view.kind).toBe('matchup')
    if (view.kind !== 'matchup') return
    expect(view.me.name).toBe('Gridiron Gang')
    expect(view.opponent.name).toBe('RivalCoach')
    expect(view.me.starters[0].name).toBe('Josh Allen')
    expect(saveUserId).toHaveBeenCalledWith(USER_ID)
    // The player list is never requested by the matchup flow itself.
    expect(get.mock.calls.map(c => c[0])).not.toContain('/players/nfl')
  })

  it("asks for this week's projections and adds them", async () => {
    const getProjections = vi.fn(async () => ({
      players: { '4984': { pass_td: 2, pass_yd: 250 } },
      teams: ['BUF']
    }))
    const [view] = await fetcher(api(), {}, getProjections).fetch()
    expect(getProjections).toHaveBeenCalledWith('2026', 5)
    if (view.kind !== 'matchup') throw new Error('expected a matchup')
    expect(view.projections).toBe(true)
    // 2 × 4 + 250 × 0.04 with the fixture league's scoring.
    expect(view.me.starters[0].projected).toBe(18)
  })

  it('keeps working when projections fail', async () => {
    for (const getProjections of [
      vi.fn(async () => null),
      vi.fn(async () => {
        throw new Error('endpoint moved')
      })
    ]) {
      const [view] = await fetcher(api(), {}, getProjections).fetch()
      if (view.kind !== 'matchup') throw new Error('expected a matchup')
      expect(view.projections).toBe(false)
      expect(view.me.points).toBe(205.55)
    }
  })

  it('skips the user lookup once the id is known', async () => {
    const get = api()
    await fetcher(get, { userId: USER_ID }).fetch()
    expect(get).not.toHaveBeenCalledWith('/user/samplemanager')
  })

  it('uses the saved league', async () => {
    const other = '910000000000000002'
    const get = api({
      [`/league/${other}`]: { ...(fixture('league.json') as object), name: 'Other' },
      [`/league/${other}/rosters`]: fixture('rosters.json'),
      [`/league/${other}/users`]: fixture('users.json'),
      [`/league/${other}/matchups/5`]: fixture('matchups-week5.json')
    })
    const [view] = await fetcher(get, { leagueId: other }).fetch()
    expect(view).toMatchObject({ kind: 'matchup', leagueName: 'Other' })
  })

  it('needs a username', async () => {
    const { fetch } = fetcher(api(), { username: null })
    await expect(fetch()).rejects.toThrow(NOT_CONFIGURED)
  })

  it('reports an unknown username (Sleeper answers null)', async () => {
    const get = api({ '/user/samplemanager': null })
    const err = await fetcher(get).fetch().catch(e => e)
    expect(err.message).toBe(userNotFound('samplemanager'))
    expect(describeFantasyError(err).dropItems).toBe(true)
  })

  it('has a friendly notice in the offseason', async () => {
    const get = api({ '/state/nfl': fixture('state-offseason.json') })
    const [view] = await fetcher(get).fetch()
    expect(view).toMatchObject({ kind: 'none' })
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('has a friendly notice without leagues', async () => {
    const get = api({ [`/user/${USER_ID}/leagues/nfl/2026`]: [] })
    const [view] = await fetcher(get).fetch()
    expect(view).toMatchObject({ kind: 'none' })
  })

  it('has a friendly notice before the draft', async () => {
    const get = api({ [`/league/${LEAGUE}`]: fixture('league-predraft.json') })
    const [view] = await fetcher(get).fetch()
    expect(view).toMatchObject({
      kind: 'none',
      leagueName: 'Sample Dynasty League'
    })
  })

  it('has a friendly notice when eliminated', async () => {
    const get = api({
      [`/league/${LEAGUE}/matchups/5`]: fixture('matchups-eliminated.json')
    })
    const [view] = await fetcher(get).fetch()
    expect(view).toMatchObject({ kind: 'none', week: 5 })
  })

  it('lets network errors through as stale, not as setup problems', async () => {
    const get = vi.fn(async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), {
        code: 'ENOTFOUND'
      })
    })
    const err = await fetcher(get).fetch().catch(e => e)
    expect(describeFantasyError(err)).toEqual({
      message: OFFLINE,
      dropItems: false
    })
  })

  it('describes Sleeper server errors', () => {
    expect(
      describeFantasyError({ response: { status: 503 } }).message
    ).toMatch(/Sleeper is having problems \(503\)/)
  })
})
