import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import {
  availability,
  buildView,
  EMPTY_SLOT,
  FANTASY_IDLE_INTERVAL,
  FANTASY_LIVE_INTERVAL,
  fantasyInterval,
  findMyRoster,
  leagueNotice,
  mapBench,
  mapStarters,
  NO_MATCHUP,
  NOT_IN_LEAGUE,
  OFFSEASON,
  pairMatchup,
  parseLeagues,
  parseMatchups,
  parseState,
  pickLeague,
  PlayerContext,
  playersFresh,
  PLAYERS_MAX_AGE,
  seasonNotice,
  slimPlayers,
  slotLabel,
  sortByPoints,
  starterSlots,
  teamNames,
  teamTotal,
  ViewInput
} from './logic.js'
import {
  parseProjections,
  playingTeams,
  Projections
} from './projections.js'

import { FantasyPlayer, Game } from '../feeds/types.js'

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const projections: Projections = {
  players: Object.assign(
    {},
    ...['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(pos =>
      parseProjections(fixture(`projections-${pos}.json`))
    )
  ),
  teams: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].flatMap(pos =>
    playingTeams(fixture(`projections-${pos}.json`))
  )
}

const MY_ID = '900000000000000001'
const players = slimPlayers(fixture('players-sample.json'))
const league = fixture('league.json') as { roster_positions: string[] }
const rosters = fixture('rosters.json')
const users = fixture('users.json')
const week5 = parseMatchups(fixture('matchups-week5.json'))
const slots = starterSlots(league.roster_positions)
const ctx: PlayerContext = { players, projections: null, scoring: null }

function input(over: Partial<ViewInput> = {}): ViewInput {
  return {
    userId: MY_ID,
    league,
    rosters,
    users,
    matchups: fixture('matchups-week5.json'),
    players,
    week: 5,
    ...over
  }
}

describe('slimPlayers', () => {
  it('keeps name, position and team only', () => {
    expect(players['4984']).toEqual({
      name: 'Josh Allen',
      position: 'QB',
      team: 'BUF'
    })
  })

  it('names team defenses from first and last name', () => {
    expect(players.BUF).toEqual({
      name: 'Buffalo Bills',
      position: 'DEF',
      team: 'BUF'
    })
  })

  it('marks players Sleeper lists as out or inactive', () => {
    // Real sample: IR with roster status Inactive.
    expect(players['5859'].out).toBe('OUT')
    // Questionable still plays.
    expect(players['4881'].out).toBeUndefined()
    expect(availability('Out', 'Active')).toBe('OUT')
    expect(availability('Sus', 'Active')).toBe('OUT')
    expect(availability(null, 'Inactive')).toBe('Inactive')
    expect(availability('Doubtful', 'Active')).toBeUndefined()
    expect(availability(undefined, undefined)).toBeUndefined()
  })

  it('ignores junk', () => {
    expect(slimPlayers(null)).toEqual({})
    expect(slimPlayers({ a: null, b: 'x', c: {} })).toEqual({
      c: { name: 'c', position: '' }
    })
  })
})

describe('playersFresh', () => {
  it('is fresh for a day', () => {
    expect(playersFresh(null, 0)).toBe(false)
    expect(playersFresh(1000, 1000 + PLAYERS_MAX_AGE - 1)).toBe(true)
    expect(playersFresh(1000, 1000 + PLAYERS_MAX_AGE)).toBe(false)
  })
})

describe('starterSlots', () => {
  it('drops bench, IR and taxi slots and keeps order', () => {
    expect(slots).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'SUPER_FLEX',
      'K',
      'DEF'
    ])
    expect(starterSlots(['QB', 'TAXI', 'BN', 'RES', 'K'])).toEqual([
      'QB',
      'K'
    ])
    expect(starterSlots(undefined)).toEqual([])
  })

  it('shortens long slot names', () => {
    expect(slotLabel('SUPER_FLEX')).toBe('SF')
    expect(slotLabel('REC_FLEX')).toBe('W/T')
    expect(slotLabel('FLEX')).toBe('FLEX')
    expect(slotLabel('DEF')).toBe('DEF')
  })
})

describe('teamNames', () => {
  const names = teamNames(rosters, users)

  it('prefers team_name, then display_name', () => {
    expect(names.get(1)).toBe('Gridiron Gang')
    expect(names.get(2)).toBe('RivalCoach')
    // Blank team_name falls back too.
    expect(names.get(3)).toBe('ThirdTeam')
  })

  it('names ownerless rosters by number', () => {
    expect(names.get(4)).toBe('Team 4')
  })
})

describe('findMyRoster', () => {
  it('finds owned and co-owned rosters', () => {
    expect(findMyRoster(rosters, MY_ID)?.roster_id).toBe(1)
    expect(findMyRoster(rosters, '900000000000000009')?.roster_id).toBe(3)
    expect(findMyRoster(rosters, 'nobody')).toBeNull()
  })
})

describe('pairMatchup', () => {
  it('pairs the two entries with the same matchup_id', () => {
    const pair = pairMatchup(week5, 1)
    expect(pair?.me.rosterId).toBe(1)
    expect(pair?.opponent.rosterId).toBe(2)
    expect(pairMatchup(week5, 4)?.opponent.rosterId).toBe(3)
  })

  it('is null on a null matchup_id or a missing entry', () => {
    const out = parseMatchups(fixture('matchups-eliminated.json'))
    expect(pairMatchup(out, 1)).toBeNull()
    const bye = parseMatchups(fixture('matchups-bye.json'))
    expect(pairMatchup(bye, 1)).toBeNull()
  })

  it('is null when the opponent is missing', () => {
    expect(pairMatchup(week5.slice(0, 1), 1)).toBeNull()
  })
})

describe('teamTotal', () => {
  const [mine] = week5

  it("uses Sleeper's total", () => {
    expect(teamTotal(mine)).toBe(205.55)
  })

  it('prefers a commissioner override', () => {
    expect(teamTotal({ ...mine, customPoints: 99.5 })).toBe(99.5)
  })

  it('sums the starters when the total is missing', () => {
    expect(teamTotal({ ...mine, points: null })).toBe(205.55)
    const opp = week5[1]
    // The empty slot counts as zero.
    expect(teamTotal({ ...opp, points: null })).toBe(115.81)
  })
})

describe('mapStarters', () => {
  it('labels each starter with its slot, name and points', () => {
    const starters = mapStarters(week5[0], slots, ctx)
    expect(starters.map(p => p.slot)).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'SF',
      'K',
      'DEF'
    ])
    expect(starters[0]).toEqual({
      id: '4984',
      name: 'Josh Allen',
      position: 'QB',
      team: 'BUF',
      slot: 'QB',
      points: 18.69
    })
    expect(starters[9]).toMatchObject({
      name: 'Buffalo Bills',
      slot: 'DEF',
      points: 19.47
    })
  })

  it('shows an empty slot', () => {
    const starters = mapStarters(week5[1], slots, ctx)
    expect(starters[6]).toEqual({
      id: `${EMPTY_SLOT}:FLEX`,
      name: 'Empty',
      position: '',
      slot: 'FLEX',
      points: 0
    })
  })

  it('falls back to the id for unknown players', () => {
    const [p] = mapStarters(
      { ...week5[0], starters: ['99999'], playersPoints: { 99999: 3 } },
      ['QB'],
      ctx
    )
    expect(p).toMatchObject({ id: '99999', name: '99999', points: 3 })
  })
})

describe('mapBench', () => {
  it('lists non-starters by points, without IR', () => {
    const bench = mapBench(week5[0], ctx, ['7569'])
    expect(bench.map(p => p.id)).toEqual(['6813', '8130', '9226', '7547'])
    expect(bench.every(p => p.slot === 'BN')).toBe(true)
  })
})

describe('sortByPoints', () => {
  it('sorts by points, then name', () => {
    const p = (name: string, points: number): FantasyPlayer => ({
      id: name,
      name,
      position: '',
      slot: 'BN',
      points
    })
    expect(
      sortByPoints([p('b', 1), p('a', 1), p('c', 5)]).map(x => x.name)
    ).toEqual(['c', 'a', 'b'])
  })
})

describe('buildView', () => {
  it('builds my matchup against my opponent', () => {
    const view = buildView(input())
    if (view.kind !== 'matchup') throw new Error('expected a matchup')
    expect(view.leagueName).toBe('Sample Dynasty League')
    expect(view.week).toBe(5)
    expect(view.me).toMatchObject({
      rosterId: 1,
      name: 'Gridiron Gang',
      points: 205.55
    })
    expect(view.opponent).toMatchObject({
      rosterId: 2,
      name: 'RivalCoach',
      points: 115.81
    })
    expect(view.me.starters).toHaveLength(10)
    expect(view.opponent.starters).toHaveLength(10)
    // IR player is on neither list.
    expect(view.me.bench.map(p => p.id)).not.toContain('7569')
    expect(view.opponent.bench.map(p => p.id)).toEqual([
      '3198',
      '5859',
      '8112'
    ])
  })

  it('adds projected points from the league scoring settings', () => {
    const view = buildView(input({ projections }))
    if (view.kind !== 'matchup') throw new Error('expected a matchup')
    expect(view.projections).toBe(true)
    const allen = view.me.starters[0]
    expect(allen.id).toBe('4984')
    expect(allen.projected).toBeCloseTo(22.01, 2)
    expect(view.me.starters[9]).toMatchObject({ id: 'BUF' })
    expect(view.me.starters[9].projected).toBeCloseTo(5.12, 2)
    // KC is on bye: no projection, no crash.
    expect(view.opponent.starters[9].id).toBe('KC')
    expect(view.opponent.starters[9].projected).toBeUndefined()
    // The empty slot never gets one.
    expect(view.opponent.starters[6].projected).toBeUndefined()
    // Bench players get one too.
    expect(view.me.bench.find(p => p.id === '6813')?.projected).toBeCloseTo(
      18.91,
      2
    )
  })

  it('falls back to pts_* when the league has no scoring settings', () => {
    const noScoring = { ...(league as object), scoring_settings: undefined }
    const view = buildView(input({ league: noScoring, projections }))
    if (view.kind !== 'matchup') throw new Error('expected a matchup')
    // No `rec` setting → standard scoring.
    const rb = view.me.starters[1]
    expect(rb.id).toBe('9221')
    expect(rb.projected).toBe(20.71)
  })

  it('hides projections when Sleeper had none', () => {
    for (const p of [null, undefined, { players: {}, teams: [] }]) {
      const view = buildView(input({ projections: p }))
      if (view.kind !== 'matchup') throw new Error('expected a matchup')
      expect(view.projections).toBe(false)
      expect(view.me.starters.every(x => x.projected === undefined)).toBe(
        true
      )
    }
  })

  it('carries the out marker to the player row', () => {
    const view = buildView(input())
    if (view.kind !== 'matchup') throw new Error('expected a matchup')
    expect(view.opponent.bench.find(p => p.id === '5859')?.out).toBe('OUT')
  })

  it('says so when there is no matchup', () => {
    expect(
      buildView(input({ matchups: fixture('matchups-eliminated.json') }))
    ).toEqual({
      kind: 'none',
      leagueName: 'Sample Dynasty League',
      week: 5,
      message: NO_MATCHUP
    })
    expect(
      buildView(input({ matchups: fixture('matchups-bye.json') }))
    ).toMatchObject({ kind: 'none', message: NO_MATCHUP })
    expect(buildView(input({ matchups: [] }))).toMatchObject({
      kind: 'none'
    })
  })

  it('says so when the user has no team in the league', () => {
    expect(buildView(input({ userId: 'nobody' }))).toMatchObject({
      kind: 'none',
      message: NOT_IN_LEAGUE
    })
  })

  it('never throws on junk', () => {
    expect(
      buildView(
        input({ league: null, rosters: 'x', users: 3, matchups: [null, 1] })
      )
    ).toMatchObject({ kind: 'none' })
  })
})

describe('season state', () => {
  it('reads /state/nfl', () => {
    expect(parseState(fixture('state-regular.json'))).toEqual({
      season: '2026',
      week: 5,
      seasonType: 'regular'
    })
    expect(parseState(null)).toBeNull()
  })

  it('has a notice in the offseason only', () => {
    const off = parseState(fixture('state-offseason.json'))
    expect(off && seasonNotice(off)).toBe(OFFSEASON)
    const reg = parseState(fixture('state-regular.json'))
    expect(reg && seasonNotice(reg)).toBeNull()
    expect(seasonNotice({ season: '2026', week: 1, seasonType: 'post' })).toBeNull()
  })

  it('has a notice before the draft', () => {
    expect(leagueNotice(fixture('league-predraft.json'))).toMatch(/draft/)
    expect(leagueNotice(fixture('league.json'))).toBeNull()
    expect(leagueNotice({ status: 'complete' })).toMatch(/over/)
  })
})

describe('leagues', () => {
  const leagues = parseLeagues(fixture('leagues.json'))

  it('lists id and name', () => {
    expect(leagues).toEqual([
      { id: '910000000000000001', name: 'Sample Dynasty League' },
      { id: '910000000000000002', name: 'Sample Redraft League' }
    ])
  })

  it('keeps the saved league, else picks the first', () => {
    expect(pickLeague(leagues, '910000000000000002')?.id).toBe(
      '910000000000000002'
    )
    expect(pickLeague(leagues, 'gone')?.id).toBe('910000000000000001')
    expect(pickLeague(leagues, null)?.id).toBe('910000000000000001')
    expect(pickLeague([], null)).toBeNull()
  })
})

describe('fantasyInterval', () => {
  const now = 1_000_000_000
  const game = (over: Partial<Game>): Game => ({
    id: 'g',
    league: 'nfl',
    home: { key: 'nfl:AAA', abbr: 'AAA', name: 'A', score: 0 },
    away: { key: 'nfl:BBB', abbr: 'BBB', name: 'B', score: 0 },
    state: 'pre',
    detail: '',
    start: now + 60 * 60 * 1000,
    ...over
  })

  it('polls fast while an NFL game is live', () => {
    expect(fantasyInterval([game({ state: 'in', start: now })], now)).toBe(
      FANTASY_LIVE_INTERVAL
    )
    expect(FANTASY_LIVE_INTERVAL).toBe(30_000)
  })

  it('polls slowly otherwise, ignoring the NBA', () => {
    expect(fantasyInterval([], now)).toBe(FANTASY_IDLE_INTERVAL)
    expect(fantasyInterval([game({})], now)).toBe(FANTASY_IDLE_INTERVAL)
    expect(
      fantasyInterval([game({ league: 'nba', state: 'in', start: now })], now)
    ).toBe(FANTASY_IDLE_INTERVAL)
    expect(FANTASY_IDLE_INTERVAL).toBe(10 * 60 * 1000)
  })
})
