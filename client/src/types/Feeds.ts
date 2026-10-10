export type FeedType =
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

// Sent by the host (percent, 0-100) for the row color washes.
export interface DisplaySettings {
  sportsTintOpacity: number
  calendarTintOpacity: number
}

export type { CalendarEvent } from '@/modules/calendar/types.ts'
export type { Task } from '@/modules/todo/types.ts'
export type { Team, Game, SportsPayload } from '@/modules/sports/types.ts'
export type {
  FantasyPlayer,
  FantasyGameStatus,
  FantasyTeam,
  FantasyView
} from '@/modules/fantasy/types.ts'
export type { WeatherHour, WeatherView } from '@/modules/weather/types.ts'
export type { ConnectorView } from '@/modules/connector/types.ts'
