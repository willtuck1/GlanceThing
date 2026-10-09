import type { FantasyPlayer, FantasyTeam } from '../../../types/Feeds.ts'

// One line of the matchup grid: my player on the left, my opponent's on the
// right, the shared slot label in the middle.
export interface MatchupRow {
  key: string
  slot: string
  mine: FantasyPlayer | null
  theirs: FantasyPlayer | null
}

function pair(
  prefix: string,
  mine: FantasyPlayer[],
  theirs: FantasyPlayer[]
): MatchupRow[] {
  const rows: MatchupRow[] = []
  const count = Math.max(mine.length, theirs.length)
  for (let i = 0; i < count; i++) {
    const a = mine[i] ?? null
    const b = theirs[i] ?? null
    rows.push({
      key: `${prefix}${i}`,
      slot: a?.slot ?? b?.slot ?? '',
      mine: a,
      theirs: b
    })
  }
  return rows
}

// Starters line up slot by slot, since both teams share the league's
// lineup. The bench is just side by side, best scorers first.
export function starterRows(me: FantasyTeam, opponent: FantasyTeam) {
  return pair('s', me.starters, opponent.starters)
}

export function benchRows(me: FantasyTeam, opponent: FantasyTeam) {
  return pair('b', me.bench, opponent.bench)
}

export function formatPoints(points: number) {
  return points.toFixed(2)
}

// 'WR · MIN', or just one of them.
export function playerDetail(player: FantasyPlayer) {
  return [player.position, player.team].filter(Boolean).join(' · ')
}

export type Leader = 'me' | 'opponent' | 'tied'

export function leader(me: FantasyTeam, opponent: FantasyTeam): Leader {
  if (me.points > opponent.points) return 'me'
  if (opponent.points > me.points) return 'opponent'
  return 'tied'
}
