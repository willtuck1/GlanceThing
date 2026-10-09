import type { DisplaySettings } from '@/types/Feeds.ts'
import { TEAM_TINT_ALPHA, TINT_ALPHA } from './tint.ts'

export interface DisplayAlphas {
  sportsAlpha: number
  calendarAlpha: number
}

// Used until (or unless) the host sends display settings; older hosts don't.
export const DISPLAY_FALLBACK: DisplayAlphas = {
  sportsAlpha: TEAM_TINT_ALPHA,
  calendarAlpha: TINT_ALPHA
}

function toAlpha(percent: unknown, fallback: number) {
  if (typeof percent !== 'number' || !isFinite(percent)) return fallback
  return Math.min(100, Math.max(0, percent)) / 100
}

// Host percent (0-100) to alpha (0-1), each field on its own.
export function parseDisplay(data: unknown): DisplayAlphas {
  const d = (
    data && typeof data === 'object' ? data : {}
  ) as Partial<Record<keyof DisplaySettings, unknown>>
  return {
    sportsAlpha: toAlpha(
      d.sportsTintOpacity,
      DISPLAY_FALLBACK.sportsAlpha
    ),
    calendarAlpha: toAlpha(
      d.calendarTintOpacity,
      DISPLAY_FALLBACK.calendarAlpha
    )
  }
}
