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

// Instant for a wall-clock time in the zone (wall is given as a UTC-shaped ms).
function wallToInstant(wall: number, timeZone: string): number {
  const first = wall - offsetAt(wall, timeZone)
  const second = wall - offsetAt(first, timeZone)
  return second
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
  let wall: number
  if (v.$host === 'now')
    wall = Date.UTC(
      base.y,
      base.mo - 1,
      base.d,
      base.h,
      base.mi,
      base.s,
      now.getUTCMilliseconds()
    )
  else if (v.$host === 'dayEnd')
    wall = Date.UTC(base.y, base.mo - 1, base.d + days, 23, 59, 59, 999)
  else wall = Date.UTC(base.y, base.mo - 1, base.d + days, 0, 0, 0, 0)

  const instant =
    v.$host === 'now' ? now.getTime() : wallToInstant(wall, timeZone)
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
