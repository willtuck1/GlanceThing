import { describe, expect, it } from 'vitest'

import {
  benchRows,
  formatPoints,
  leader,
  playerDetail,
  starterRows
} from './rows.ts'

import type { FantasyPlayer, FantasyTeam } from '../../../types/Feeds.ts'

function player(id: string, slot: string, points = 0): FantasyPlayer {
  return { id, name: id, position: 'WR', team: 'MIN', slot, points }
}

function team(
  starters: FantasyPlayer[],
  bench: FantasyPlayer[] = [],
  points = 0
): FantasyTeam {
  return { rosterId: 1, name: 'T', points, starters, bench }
}

describe('starterRows', () => {
  it('lines up both lineups slot by slot', () => {
    const rows = starterRows(
      team([player('a', 'QB'), player('b', 'FLEX')]),
      team([player('x', 'QB'), player('y', 'FLEX')])
    )
    expect(rows.map(r => [r.slot, r.mine?.id, r.theirs?.id])).toEqual([
      ['QB', 'a', 'x'],
      ['FLEX', 'b', 'y']
    ])
    expect(rows.map(r => r.key)).toEqual(['s0', 's1'])
  })

  it('leaves a side blank when one lineup is shorter', () => {
    const rows = starterRows(team([player('a', 'QB')]), team([]))
    expect(rows).toEqual([
      { key: 's0', slot: 'QB', mine: rows[0].mine, theirs: null }
    ])
  })
})

describe('benchRows', () => {
  it('pairs benches of different lengths', () => {
    const rows = benchRows(
      team([], [player('a', 'BN')]),
      team([], [player('x', 'BN'), player('y', 'BN')])
    )
    expect(rows.map(r => [r.key, r.mine?.id ?? null, r.theirs?.id])).toEqual([
      ['b0', 'a', 'x'],
      ['b1', null, 'y']
    ])
    expect(rows[1].slot).toBe('BN')
  })
})

describe('formatting', () => {
  it('shows two decimals', () => {
    expect(formatPoints(0)).toBe('0.00')
    expect(formatPoints(18.7)).toBe('18.70')
  })

  it('joins position and team', () => {
    expect(playerDetail(player('a', 'QB'))).toBe('WR · MIN')
    expect(
      playerDetail({ id: '0', name: 'Empty', position: '', slot: 'K', points: 0 })
    ).toBe('')
  })

  it('finds the leader', () => {
    expect(leader(team([], [], 10), team([], [], 5))).toBe('me')
    expect(leader(team([], [], 5), team([], [], 10))).toBe('opponent')
    expect(leader(team([], [], 5), team([], [], 5))).toBe('tied')
  })
})
