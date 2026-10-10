export type FeedKey =
  | 'calendar'
  | 'todo'
  | 'sports'
  | 'fantasy'
  | 'weather'
  | `json:${string}`
  | `mcp:${string}`

export interface FeedPayload<T> {
  items: T[]
  fetchedAt: number | null
  fetchedAtLabel: string
  stale: boolean
  error: string | null
}

export interface CalendarEvent {
  id: string
  title: string
  allDay: boolean
  startLabel: string
  endLabel: string
  dayLabel: string
  location?: string
  calendarColor: string
  startMs: number
  endMs: number
}

export interface Task {
  id: string
  listId: string
  title: string
  done: boolean
  dueLabel?: string
}

export interface Team {
  key: string
  abbr: string
  name: string
  score: number | null
  logo?: string
  // Hex like '#860038', from ESPN. Missing on games cached by older hosts.
  color?: string
}

export interface Game {
  id: string
  league: 'nba' | 'nfl'
  home: Team
  away: Team
  state: 'pre' | 'in' | 'post'
  detail: string
  // Scheduled start, epoch ms. Used for sorting and polling interval.
  start: number
  // Live games only: the period (5+ is overtime) and seconds left in it.
  period?: number
  clock?: number
  // The scoreboard's week number (NFL). Missing on older cached games.
  week?: number
  // Set when this game's league failed to refresh and the game is from the
  // last good fetch.
  stale?: boolean
}

export interface SportsPayload extends FeedPayload<Game> {
  favorites?: string[]
}

export interface FantasyPlayer {
  id: string
  name: string
  // 'QB', 'DEF', ... Empty for an empty starter slot.
  position: string
  // NFL team abbreviation, missing for free agents and empty slots.
  team?: string
  // Short label of the lineup slot ('QB', 'FLEX', 'SF', 'BN').
  slot: string
  points: number
  // Projected points for the week. Missing when Sleeper has none.
  projected?: number
  // Set when Sleeper's player list marks the player out for the week.
  out?: 'OUT' | 'Inactive'
  // The player's NFL game, added from the Sports feed when ESPN is up.
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
      // False when Sleeper's projections couldn't be loaded; the tab then
      // hides the projection column and the estimate.
      projections?: boolean
      // Host only, removed before sending: Sleeper teams with a game this
      // week, from the projections. A team missing here is on bye.
      playingTeams?: string[]
      me: FantasyTeam
      opponent: FantasyTeam
    }
  | {
      kind: 'none'
      leagueName?: string
      week?: number
      message: string
    }

// The one item of the weather feed: the forecast for the location set in
// Settings, or a prompt to set one. Times are preformatted in the
// location's own timezone.
export type WeatherView =
  | {
      kind: 'forecast'
      locationName: string
      units: 'imperial' | 'metric'
      current: {
        tempLabel: string
        code: number
        label: string
        icon: string
      }
      highLabel: string
      lowLabel: string
      sunriseLabel: string
      sunsetLabel: string
      precipLabel: string
      hours: { timeLabel: string; tempLabel: string; precipPct: number }[]
    }
  | {
      kind: 'none'
      message: string
    }
