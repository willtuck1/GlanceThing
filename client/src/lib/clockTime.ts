// Pure clock math. Displayed time comes from host time plus the device's
// monotonic performance clock, never from the device's wall clock.

export type ClockAnchor = {
  hostMs: number
  perfMs: number
  offsetMin: number
  hour12: boolean
}

export const anchorFrom = (
  data: unknown,
  perfNow: number
): ClockAnchor | null => {
  const d = (data ?? {}) as Record<string, unknown>
  const now = d.now
  const offsetMin = d.offsetMin
  if (typeof now !== 'number' || !Number.isFinite(now)) return null
  if (typeof offsetMin !== 'number' || !Number.isFinite(offsetMin))
    return null
  return {
    hostMs: now,
    perfMs: perfNow,
    offsetMin,
    hour12: d.hour12 === true
  }
}

export const hostNow = (anchor: ClockAnchor, perfNow: number): number =>
  anchor.hostMs + (perfNow - anchor.perfMs)

export const localFields = (ms: number, offsetMin: number) => {
  const d = new Date(ms + offsetMin * 60000)
  return {
    h: d.getUTCHours(),
    m: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay()
  }
}

export const handAngles = (h: number, m: number, s: number) => ({
  hour: (h % 12) * 30 + m * 0.5 + s / 120,
  minute: m * 6 + s * 0.1,
  second: s * 6
})

export const digits = (h: number, m: number, hour12: boolean) => {
  const mm = String(m).padStart(2, '0')
  if (!hour12) return { hh: String(h).padStart(2, '0'), mm, suffix: '' }
  return {
    hh: String(h % 12 === 0 ? 12 : h % 12),
    mm,
    suffix: h < 12 ? 'AM' : 'PM'
  }
}

export const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}
