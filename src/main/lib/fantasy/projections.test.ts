import { readFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'

import {
  createProjectionStore,
  parseProjections,
  parseScoring,
  PROJECTION_POSITIONS,
  projectedPoints,
  projectionsUrl,
  PROJECTIONS_MAX_AGE,
  PROJECTIONS_RETRY_MS,
  receptionField,
  Scoring
} from './projections.js'

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const byPosition: Record<string, unknown> = Object.fromEntries(
  PROJECTION_POSITIONS.map(p => [p, fixture(`projections-${p}.json`)])
)
const league = fixture('league.json')
const scoring = parseScoring(league) as Scoring

// Answers projection URLs from the fixtures, like Sleeper would.
function fakeGet(fail: string[] = []) {
  return vi.fn(async (url: string) => {
    const pos = /position\[\]=([A-Z]+)/.exec(url)?.[1] ?? ''
    if (fail.includes(pos)) throw new Error(`${pos} down`)
    return byPosition[pos]
  })
}

describe('projectionsUrl', () => {
  it('builds the unofficial endpoint for one position', () => {
    expect(projectionsUrl('2026', 5, 'DEF')).toBe(
      'https://api.sleeper.app/projections/nfl/2026/5?season_type=regular&position[]=DEF'
    )
  })
})

describe('parseProjections (real Sleeper samples)', () => {
  it('maps player id to stats, including DEF by team abbreviation', () => {
    const qb = parseProjections(byPosition.QB)
    expect(qb['4984']).toMatchObject({ pass_yd: expect.any(Number) })
    const def = parseProjections(byPosition.DEF)
    expect(Object.keys(def)).toEqual(['BUF'])
    expect(def.BUF.pts_allow_14_20 ?? def.BUF.pts_allow).toBeDefined()
  })

  it('skips entries without an id or stats and drops non-numbers', () => {
    const map = parseProjections([
      { player_id: '1', stats: { pass_yd: 100, note: 'x', bad: null } },
      { player_id: '', stats: { pass_yd: 1 } },
      { stats: { pass_yd: 1 } },
      { player_id: '2' },
      null,
      'junk'
    ])
    expect(map).toEqual({ '1': { pass_yd: 100 } })
  })

  it('throws when the response is not a list (shape changed)', () => {
    expect(() => parseProjections({ players: [] })).toThrow()
    expect(() => parseProjections(null)).toThrow()
  })
})

describe('parseScoring', () => {
  it("reads the league's scoring_settings", () => {
    expect(scoring.rec).toBe(1)
    expect(scoring.pass_td).toBe(4)
  })

  it('is null when the league has none', () => {
    expect(parseScoring({ name: 'x' })).toBeNull()
    expect(parseScoring({ scoring_settings: { rec: 'one' } })).toBeNull()
    expect(parseScoring(null)).toBeNull()
  })
})

describe('receptionField', () => {
  it('follows points per reception', () => {
    expect(receptionField({ rec: 1 })).toBe('pts_ppr')
    expect(receptionField({ rec: 0.5 })).toBe('pts_half_ppr')
    expect(receptionField({ rec: 0 })).toBe('pts_std')
    expect(receptionField({ pass_td: 4 })).toBe('pts_std')
    expect(receptionField(null)).toBe('pts_std')
  })
})

describe('projectedPoints', () => {
  it("scores stats with the league's settings", () => {
    const stats = { pass_yd: 250, pass_td: 2, pass_int: 1, rush_yd: 10 }
    // 250 × 0.04 + 2 × 4 − 1 + 10 × 0.1
    expect(projectedPoints(stats, scoring)).toBe(18)
  })

  it('reflects custom scoring that Sleeper totals ignore', () => {
    const stats = { pass_td: 2, pts_std: 8, pts_ppr: 8 }
    expect(projectedPoints(stats, { pass_td: 6 })).toBe(12)
  })

  it("matches Sleeper's own PPR totals on real samples", () => {
    for (const pos of PROJECTION_POSITIONS) {
      const map = parseProjections(byPosition[pos])
      for (const stats of Object.values(map)) {
        if (stats.pts_ppr === undefined) continue
        const pts = projectedPoints(stats, scoring) as number
        // Sleeper rounds its stat lines, so totals differ by cents.
        expect(Math.abs(pts - stats.pts_ppr)).toBeLessThan(0.1)
      }
    }
  })

  it('scores DEF from points-allowed and yards-allowed brackets', () => {
    const def = parseProjections(byPosition.DEF).BUF
    expect(projectedPoints(def, scoring)).toBeCloseTo(def.pts_ppr, 0)
  })

  it('falls back to pts_* by reception setting when no stat is scored', () => {
    const stats = { pts_std: 10, pts_half_ppr: 12, pts_ppr: 14, gp: 1 }
    expect(projectedPoints(stats, { rec: 1, pass_td: 4 })).toBe(14)
    expect(projectedPoints(stats, { rec: 0.5, pass_td: 4 })).toBe(12)
    expect(projectedPoints(stats, { pass_td: 4 })).toBe(10)
  })

  it('falls back to pts_std without scoring settings', () => {
    expect(projectedPoints({ pass_yd: 300, pts_std: 12 }, null)).toBe(12)
  })

  it('is null when the line has nothing usable', () => {
    // Real sample: an injured QB whose line is only ADP.
    const qb = parseProjections(byPosition.QB)['4881']
    expect(projectedPoints(qb, scoring)).toBeNull()
    expect(projectedPoints(undefined, scoring)).toBeNull()
    expect(projectedPoints({}, null)).toBeNull()
  })

  it('rounds to two decimals', () => {
    expect(projectedPoints({ rec_yd: 1.234 }, { rec_yd: 1 })).toBe(1.23)
  })
})

describe('createProjectionStore', () => {
  function setup(get = fakeGet()) {
    let now = 1_000_000
    const log = vi.fn()
    const store = createProjectionStore({ get, now: () => now, log })
    return {
      store,
      get,
      log,
      advance: (ms: number) => {
        now += ms
      }
    }
  }

  it('fetches every position once and merges them by player id', async () => {
    const { store, get } = setup()
    const map = await store('2026', 5)
    expect(get).toHaveBeenCalledTimes(PROJECTION_POSITIONS.length)
    expect(map?.['4984']).toBeDefined()
    expect(map?.['9221']).toBeDefined()
    expect(map?.BUF).toBeDefined()
  })

  it('caches for 15 minutes, then refreshes', async () => {
    const { store, get, advance } = setup()
    await store('2026', 5)
    advance(PROJECTIONS_MAX_AGE - 1)
    await store('2026', 5)
    expect(get).toHaveBeenCalledTimes(6)
    advance(2)
    await store('2026', 5)
    expect(get).toHaveBeenCalledTimes(12)
  })

  it('refetches when the week changes', async () => {
    const { store, get } = setup()
    await store('2026', 5)
    await store('2026', 6)
    expect(get).toHaveBeenCalledTimes(12)
  })

  it('shares one download between concurrent calls', async () => {
    const { store, get } = setup()
    await Promise.all([store('2026', 5), store('2026', 5)])
    expect(get).toHaveBeenCalledTimes(6)
  })

  it('keeps the positions that worked when some fail', async () => {
    const { store, log } = setup(fakeGet(['K', 'DEF']))
    const map = await store('2026', 5)
    expect(map?.['4984']).toBeDefined()
    expect(map?.BUF).toBeUndefined()
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('returns null, never throws, when everything fails', async () => {
    const { store } = setup(fakeGet(PROJECTION_POSITIONS))
    await expect(store('2026', 5)).resolves.toBeNull()
  })

  it('returns null when the shape changed', async () => {
    const { store } = setup(vi.fn(async () => ({ error: 'moved' })))
    await expect(store('2026', 5)).resolves.toBeNull()
  })

  it('keeps the last good copy when a refresh fails', async () => {
    let down = false
    const ok = fakeGet()
    const get = vi.fn(async (url: string) => {
      if (down) throw new Error('down')
      return ok(url)
    })
    const { store, advance } = setup(get)
    const first = await store('2026', 5)
    down = true
    advance(PROJECTIONS_MAX_AGE + 1)
    expect(await store('2026', 5)).toEqual(first)
  })

  it('waits before retrying after a failure', async () => {
    const { store, get, advance } = setup(fakeGet(PROJECTION_POSITIONS))
    await store('2026', 5)
    await store('2026', 5)
    expect(get).toHaveBeenCalledTimes(6)
    advance(PROJECTIONS_RETRY_MS)
    await store('2026', 5)
    expect(get).toHaveBeenCalledTimes(12)
  })
})
