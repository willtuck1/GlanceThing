export type FeedType = 'calendar' | 'todo' | 'sports' | 'fantasy'

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
  team?: string
  // Short label of the lineup slot ('QB', 'FLEX', 'SF', 'BN').
  slot: string
  points: number
}

export interface FantasyTeam {
  rosterId: number
  name: string
  points: number
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
      me: FantasyTeam
      opponent: FantasyTeam
    }
  | {
      kind: 'none'
      leagueName?: string
      week?: number
      message: string
    }
