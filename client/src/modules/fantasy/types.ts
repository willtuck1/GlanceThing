export interface FantasyPlayer {
  id: string
  name: string
  // 'QB', 'DEF', ... Empty for an empty starter slot.
  position: string
  team?: string
  // Short label of the lineup slot ('QB', 'FLEX', 'SF', 'BN').
  slot: string
  points: number
  // Projected points for the week. Missing when Sleeper has none.
  projected?: number
  // Set when Sleeper's player list marks the player out for the week.
  out?: 'OUT' | 'Inactive'
  // The player's NFL game. Missing when ESPN is down or the team is unknown.
  game?: FantasyGameStatus
}

export interface FantasyGameStatus {
  state: 'pre' | 'in' | 'post' | 'bye' | 'out'
  // 'Sun 1:00 PM', 'Q3 4:12', 'Half', 'Final', 'Bye', 'OUT'.
  label: string
}

export interface FantasyTeam {
  rosterId: number
  name: string
  points: number
  // Estimated final score. Only with projections and game status.
  estimate?: number
  starters: FantasyPlayer[]
  bench: FantasyPlayer[]
}

// The one item of the fantasy feed: this week's matchup, or why there is
// none (bye week, offseason, eliminated).
export type FantasyView =
  | {
      kind: 'matchup'
      leagueName: string
      week: number
      // False when Sleeper's projections couldn't be loaded.
      projections?: boolean
      me: FantasyTeam
      opponent: FantasyTeam
    }
  | {
      kind: 'none'
      leagueName?: string
      week?: number
      message: string
    }
