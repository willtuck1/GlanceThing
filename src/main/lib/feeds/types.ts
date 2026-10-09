export type FeedKey = 'calendar' | 'todo' | 'sports'

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
