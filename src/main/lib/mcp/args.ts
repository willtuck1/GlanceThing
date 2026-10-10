import type { ArgValue } from './recipes.js'

type Parts = {
  y: number
  mo: number
  d: number
  h: number
  mi: number
  s: number
}

function partsAt(ms: number, timeZone: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  })
  const p: Record<string, number> = {}
  for (const x of f.formatToParts(new Date(ms)))
    if (x.type !== 'literal') p[x.type] = Number(x.value)
  return {
    y: p.year,
    mo: p.month,
    d: p.day,
    h: p.hour % 24,
    mi: p.minute,
    s: p.second
  }
}

// Offset of the zone from UTC at an instant, in ms.
function offsetAt(ms: number, timeZone: string): number {
  const p = partsAt(ms, timeZone)
  return (
    Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) -
    Math.floor(ms / 1000) * 1000
  )
}

// Local calendar date at an instant, as a UTC-midnight ms (comparable).
function localDay(ms: number, timeZone: string): number {
  const p = partsAt(ms, timeZone)
  return Date.UTC(p.y, p.mo - 1, p.d)
}

// First instant whose local date is `day` (a UTC-midnight ms). Midnight may
// not exist (spring-forward at 00:00) or occur twice (fall-back to 00:00).
function dayStartInstant(day: number, timeZone: string): number {
  const isStart = (t: number): boolean =>
    localDay(t, timeZone) >= day && localDay(t - 1, timeZone) < day
  // Usual case: midnight exists once at the offset in force around it.
  const first = day - offsetAt(day, timeZone)
  const guess = day - offsetAt(first, timeZone)
  if (isStart(guess)) return guess
  if (isStart(first)) return first
  // Local dates only move forward; UTC offsets lie within -12h..+14h.
  let lo = day - 15 * 3_600_000
  let hi = day + 13 * 3_600_000
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (localDay(mid, timeZone) >= day) hi = mid
    else lo = mid
  }
  return hi
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

function fmtOffset(ms: number): string {
  const sign = ms < 0 ? '-' : '+'
  const m = Math.abs(ms) / 60000
  return `${sign}${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

function resolveHost(
  v: Extract<ArgValue, { $host: string }>,
  now: Date,
  timeZone: string
): string | number {
  const days = v.offsetDays ?? 0
  const base = partsAt(now.getTime(), timeZone)
  const day = Date.UTC(base.y, base.mo - 1, base.d + days)
  const instant =
    v.$host === 'now'
      ? now.getTime()
      : v.$host === 'dayEnd'
        ? dayStartInstant(day + 86_400_000, timeZone) - 1
        : dayStartInstant(day, timeZone)
  const format = v.format ?? (v.$host === 'today' ? 'date' : 'iso')
  if (format === 'epochMs') return instant
  const local = new Date(instant + offsetAt(instant, timeZone))
  const date = `${pad(local.getUTCFullYear(), 4)}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`
  if (format === 'date') return date
  return `${date}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}.${pad(local.getUTCMilliseconds(), 3)}${fmtOffset(offsetAt(instant, timeZone))}`
}

function resolveValue(
  v: unknown,
  settings: Record<string, string>,
  now: Date,
  timeZone: string
): unknown {
  if (Array.isArray(v))
    return v.map(x => resolveValue(x, settings, now, timeZone))
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.$host === 'string')
      return resolveHost(
        o as Extract<ArgValue, { $host: string }>,
        now,
        timeZone
      )
    if (typeof o.$setting === 'string') return settings[o.$setting] ?? ''
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o))
      out[k] = resolveValue(o[k], settings, now, timeZone)
    return out
  }
  return v
}

export function resolveArgs(
  args: Record<string, ArgValue>,
  settings: Record<string, string>,
  now: Date,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): Record<string, unknown> {
  return resolveValue(args, settings, now, timeZone) as Record<
    string,
    unknown
  >
}
