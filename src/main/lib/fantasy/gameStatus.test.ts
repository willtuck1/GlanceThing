import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import {
  decorateFantasy,
  espnTeam,
  fractionRemaining,
  kickoffLabel,
  liveLabel,
  playerEstimate,
  playerGameStatus,
  SLEEPER_TO_ESPN,
  teamEstimate,
  weekGames
} from './gameStatus.js'
import { buildView, slimPlayers } from './logic.js'
import { parseProjections, ProjectionMap } from './projections.js'
import { normalize } from '../sports/logic.js'

import {
  FantasyPlayer,
  FantasyView,
  FeedPayload,
  Game
} from '../feeds/types.js'

function fixture(path: string): unknown {
  const url = new URL(path, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const sleeper = (name: string) => fixture(`./fixtures/${name}`)
const espn = (name: string) => fixture(`../sports/fixtures/${name}`)

// Real ESPN week 5 capture: DAL @ TB at halftime, the rest scheduled, KC and
// CAR on bye.
const week5Raw = espn('nfl-live-2.json') as {
  week: { teamsOnBye: { abbreviation: string }[] }
}
const week5 = normalize('nfl', week5Raw)
const games5 = weekGames(week5, 5)

// 'H:MM' in local time, so the tests hold in any time zone.
const fmt = (ts: number) => {
  const d = new Date(ts)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function player(over: Partial<FantasyPlayer> = {}): FantasyPlayer {
  return {
    id: 'p',
    name: 'P',
    position: 'WR',
    team: 'DAL',
    slot: 'WR',
    points: 10,
    ...over
  }
}

function nflGame(over: Partial<Game> = {}): Game {
  return {
    id: 'nfl:1',
    league: 'nfl',
    home: { key: 'nfl:TB', abbr: 'TB', name: 'Bucs', score: 0 },
    away: { key: 'nfl:DAL', abbr: 'DAL', name: 'Cowboys', score: 0 },
    state: 'in',
    detail: '',
    start: 0,
    week: 5,
    ...over
  }
}

describe('team abbreviation mapping', () => {
  it('maps the known Sleeper/ESPN differences', () => {
    expect(espnTeam('WAS')).toBe('WSH')
    expect(espnTeam('JAC')).toBe('JAX')
    expect(espnTeam('JAX')).toBe('JAX')
    expect(espnTeam('LA')).toBe('LAR')
    expect(espnTeam('LAR')).toBe('LAR')
    expect(espnTeam('KC')).toBe('KC')
  })

  it('returns null for unmapped or missing teams', () => {
    expect(espnTeam('XYZ')).toBeNull()
    expect(espnTeam('')).toBeNull()
    expect(espnTeam(undefined)).toBeNull()
  })

  it("covers exactly ESPN's 32 teams in the real week 5 capture", () => {
    const espnTeams = new Set<string>()
    for (const g of week5) espnTeams.add(g.home.abbr).add(g.away.abbr)
    for (const t of week5Raw.week.teamsOnBye) espnTeams.add(t.abbreviation)
    expect(espnTeams.size).toBe(32)
    expect(new Set(Object.values(SLEEPER_TO_ESPN))).toEqual(espnTeams)
  })

  it('maps every team in the real Sleeper samples', () => {
    const players = slimPlayers(sleeper('players-sample.json'))
    for (const p of Object.values(players))
      if (p.team) expect(espnTeam(p.team)).not.toBeNull()
  })
})

describe('weekGames', () => {
  it("indexes this week's NFL games by both teams", () => {
    expect(games5?.get('DAL')?.state).toBe('in')
    expect(games5?.get('TB')).toBe(games5?.get('DAL'))
    expect(games5?.get('WSH')?.state).toBe('pre')
    expect(games5?.has('KC')).toBe(false)
  })

  it("is null when ESPN shows another week than Sleeper's", () => {
    expect(weekGames(week5, 4)).toBeNull()
    // Older cached games have no week.
    expect(weekGames([nflGame({ week: undefined })], 5)).toBeNull()
  })

  it('skips stale games and other leagues', () => {
    expect(weekGames([nflGame({ stale: true })], 5)).toBeNull()
    expect(weekGames([nflGame({ league: 'nba' })], 5)).toBeNull()
    expect(weekGames([], 5)).toBeNull()
  })
})

describe('fractionRemaining', () => {
  it('runs from 1 at kickoff to 0 at the end of the 4th', () => {
    expect(fractionRemaining(1, 15 * 60)).toBe(1)
    expect(fractionRemaining(1, 0)).toBe(0.75)
    // Halftime (ESPN: period 2, clock 0:00).
    expect(fractionRemaining(2, 0)).toBe(0.5)
    expect(fractionRemaining(3, 4 * 60 + 12)).toBeCloseTo(
      (15 * 60 + 252) / 3600
    )
    expect(fractionRemaining(4, 0)).toBe(0)
  })

  it('counts overtime as 0 remaining', () => {
    expect(fractionRemaining(5, 600)).toBe(0)
    expect(fractionRemaining(6, 600)).toBe(0)
  })

  it('clamps odd input', () => {
    expect(fractionRemaining(0, 0)).toBe(1)
    expect(fractionRemaining(2, 5000)).toBe(0.75)
    expect(fractionRemaining(4, -30)).toBe(0)
  })
})

describe('game status labels', () => {
  it('formats kickoff as weekday and time', () => {
    // 11 Oct 2026 is a Sunday.
    expect(kickoffLabel(new Date(2026, 9, 11, 13, 0).getTime(), fmt)).toBe(
      'Sun 13:00'
    )
  })

  it('formats live games as quarter and clock', () => {
    expect(liveLabel(nflGame({ period: 3, clock: 252 }))).toBe('Q3 4:12')
    expect(liveLabel(nflGame({ period: 4, clock: 5 }))).toBe('Q4 0:05')
    expect(liveLabel(nflGame({ period: 5, clock: 121 }))).toBe('OT 2:01')
  })

  it('shows halftime from the real capture', () => {
    expect(liveLabel(games5?.get('DAL') as Game)).toBe('Half')
  })

  it("falls back to ESPN's text without quarter or clock", () => {
    expect(liveLabel(nflGame({ detail: '8:03 - 2nd' }))).toBe('8:03 - 2nd')
    expect(liveLabel(nflGame())).toBe('Live')
  })
})

describe('playerGameStatus', () => {
  it('shows kickoff time before the game', () => {
    const wsh = games5?.get('WSH') as Game
    // Sleeper's WAS is ESPN's WSH.
    expect(playerGameStatus(player({ team: 'WAS' }), games5, fmt)).toEqual({
      state: 'pre',
      label: kickoffLabel(wsh.start, fmt)
    })
  })

  it('shows live, final and bye', () => {
    expect(playerGameStatus(player({ team: 'DAL' }), games5, fmt)).toEqual({
      state: 'in',
      label: 'Half'
    })
    const finals = weekGames(
      [nflGame({ state: 'post', detail: 'Final' })],
      5
    )
    expect(playerGameStatus(player(), finals, fmt)).toEqual({
      state: 'post',
      label: 'Final'
    })
    expect(playerGameStatus(player({ team: 'KC' }), games5, fmt)).toEqual({
      state: 'bye',
      label: 'Bye'
    })
  })

  it('works for DEF, whose team is the player id', () => {
    const players = slimPlayers(sleeper('players-sample.json'))
    const kc = { ...player(), ...players.KC, id: 'KC' }
    expect(playerGameStatus(kc, games5, fmt)?.label).toBe('Bye')
  })

  it('shows OUT or Inactive when Sleeper marks the player so', () => {
    expect(playerGameStatus(player({ out: 'OUT' }), games5, fmt)).toEqual({
      state: 'out',
      label: 'OUT'
    })
    // Sleeper's word stands even without ESPN.
    expect(playerGameStatus(player({ out: 'Inactive' }), null, fmt)).toEqual({
      state: 'out',
      label: 'Inactive'
    })
  })

  it('shows nothing when the team is unknown or ESPN is unusable', () => {
    expect(playerGameStatus(player({ team: 'XYZ' }), games5, fmt)).toBe(
      undefined
    )
    expect(playerGameStatus(player({ team: undefined }), games5, fmt)).toBe(
      undefined
    )
    expect(playerGameStatus(player(), null, fmt)).toBeUndefined()
  })
})

describe('playerEstimate', () => {
  const p = player({ points: 8, projected: 20 })

  it('final: actual points', () => {
    expect(playerEstimate(p, nflGame({ state: 'post' }))).toBe(8)
  })

  it('not started: projected points', () => {
    expect(playerEstimate(player({ points: 0, projected: 20 }), nflGame({ state: 'pre' }))).toBe(20)
  })

  it('live: actual + projected × fraction remaining', () => {
    // Halftime: half the game left.
    expect(playerEstimate(p, nflGame({ period: 2, clock: 0 }))).toBe(18)
    // Q3 4:12 → (15 min + 4:12) / 60 min left.
    expect(playerEstimate(p, nflGame({ period: 3, clock: 252 }))).toBeCloseTo(
      8 + 20 * (1152 / 3600)
    )
    // Overtime: nothing left.
    expect(playerEstimate(p, nflGame({ period: 5, clock: 300 }))).toBe(8)
  })

  it('bye or inactive: actual points', () => {
    expect(playerEstimate(p, undefined)).toBe(8)
    expect(playerEstimate({ ...p, out: 'OUT' }, nflGame({ state: 'pre' }))).toBe(8)
  })

  it('missing data: actual points', () => {
    const noProj = player({ points: 3 })
    expect(playerEstimate(noProj, nflGame({ state: 'pre' }))).toBe(3)
    expect(playerEstimate(noProj, nflGame({ period: 1, clock: 900 }))).toBe(3)
    // Live but without quarter and clock.
    expect(playerEstimate(p, nflGame())).toBe(8)
  })
})

describe('teamEstimate', () => {
  it('sums the starters and skips empty slots', () => {
    const games = weekGames(
      [
        nflGame({ period: 2, clock: 0 }),
        nflGame({
          id: 'nfl:2',
          home: { key: 'nfl:BUF', abbr: 'BUF', name: 'Bills', score: null },
          away: { key: 'nfl:NE', abbr: 'NE', name: 'Pats', score: null },
          state: 'pre'
        })
      ],
      5
    ) as Map<string, Game>
    const starters = [
      player({ team: 'DAL', points: 8, projected: 20 }), // live: 18
      player({ team: 'BUF', points: 0, projected: 15.5 }), // pre: 15.5
      player({ team: 'KC', points: 0, projected: 12 }), // bye: 0
      player({ team: 'NE', points: 1, out: 'OUT', projected: 9 }), // out: 1
      player({ position: '', team: undefined, points: 0 }) // empty
    ]
    expect(teamEstimate(starters, games)).toBe(34.5)
  })
})

describe('decorateFantasy', () => {
  const projections: ProjectionMap = Object.assign(
    {},
    ...['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(pos =>
      parseProjections(sleeper(`projections-${pos}.json`))
    )
  )
  const view = buildView({
    userId: '900000000000000001',
    league: sleeper('league.json'),
    rosters: sleeper('rosters.json'),
    users: sleeper('users.json'),
    matchups: sleeper('matchups-week5.json'),
    players: slimPlayers(sleeper('players-sample.json')),
    projections,
    week: 5
  })

  function payload(items: FantasyView[] = [view]): FeedPayload<FantasyView> {
    return {
      items,
      fetchedAt: 1,
      fetchedAtLabel: '1:00',
      stale: false,
      error: null
    }
  }

  function matchup(p: FeedPayload<FantasyView>) {
    const v = p.items[0]
    if (v.kind !== 'matchup') throw new Error('expected a matchup')
    return v
  }

  const sports = { items: week5, stale: false }

  it('adds game status to every player and an estimate to each team', () => {
    const v = matchup(decorateFantasy(payload(), sports, { formatTime: fmt }))
    // Josh Allen (BUF) plays Sunday.
    expect(v.me.starters[0].game?.state).toBe('pre')
    // Opponent's KC defense is on bye.
    expect(v.opponent.starters[9].game).toEqual({ state: 'bye', label: 'Bye' })
    // Empty slot: no team, no status.
    expect(v.opponent.starters[6].game).toBeUndefined()
    // IR player on the bench.
    expect(v.opponent.bench.find(p => p.id === '5859')?.game?.label).toBe(
      'OUT'
    )
    expect(typeof v.me.estimate).toBe('number')
    expect(typeof v.opponent.estimate).toBe('number')
    // Points never change.
    expect(v.me.points).toBe(205.55)
  })

  it('without ESPN: points and projections, no status or estimate', () => {
    for (const s of [null, { items: week5, stale: true }, { items: [], stale: false }]) {
      const v = matchup(decorateFantasy(payload(), s, { formatTime: fmt }))
      expect(v.me.estimate).toBeUndefined()
      expect(v.me.starters[0].game).toBeUndefined()
      expect(v.me.starters[0].projected).toBeDefined()
      expect(v.me.points).toBe(205.55)
    }
  })

  it('without projections: status but no estimate', () => {
    const noProj = { ...view, projections: false } as FantasyView
    const v = matchup(
      decorateFantasy(payload([noProj]), sports, { formatTime: fmt })
    )
    expect(v.me.starters[0].game?.state).toBe('pre')
    expect(v.me.estimate).toBeUndefined()
  })

  it('replaces status from an earlier decoration', () => {
    const once = decorateFantasy(payload(), sports, { formatTime: fmt })
    const twice = matchup(decorateFantasy(once, null, { formatTime: fmt }))
    expect(twice.me.starters[0].game).toBeUndefined()
    expect(twice.me.estimate).toBeUndefined()
  })

  it('passes notices through', () => {
    const none: FantasyView = { kind: 'none', message: 'Offseason' }
    expect(
      decorateFantasy(payload([none]), sports, { formatTime: fmt }).items
    ).toEqual([none])
  })
})
