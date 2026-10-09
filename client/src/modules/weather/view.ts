export const ICON_NAMES = [
  'clear',
  'clear-night',
  'partly',
  'partly-night',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'snow',
  'storm'
] as const

export type IconName = (typeof ICON_NAMES)[number]

// Unknown icon names from the host fall back to cloudy.
export function iconFor(name: string): IconName {
  return (ICON_NAMES as readonly string[]).indexOf(name) >= 0
    ? (name as IconName)
    : 'cloudy'
}

// Height in px of a precipitation bar, 0-100% of maxPx. Any chance above
// zero gets at least 2px so it stays visible.
export function barHeight(pct: number, maxPx: number): number {
  const p = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0
  if (p === 0) return 0
  return Math.max(2, Math.round((p / 100) * maxPx))
}
