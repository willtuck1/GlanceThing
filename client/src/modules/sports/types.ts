import type { FeedPayload } from '@/types/Feeds.ts'

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
  // Live NFL games only: the period (5+ is overtime) and seconds left in it.
  period?: number
  clock?: number
  // The scoreboard's week number (NFL).
  week?: number
  // Set when this game's league failed to refresh and the game is from the
  // last good fetch.
  stale?: boolean
}

export interface SportsPayload extends FeedPayload<Game> {
  favorites?: string[]
}
