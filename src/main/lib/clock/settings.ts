import { getStorageValue, setStorageValue } from '../storage.js'

export type ClockStyle = 'digital' | 'analog'
export type TimerAlert = 'off' | 'notify' | 'sound'
export type ClockWidgetId =
  | 'weather'
  | 'calendar'
  | 'todo'
  | 'sports'
  | 'fantasy'

export const CLOCK_WIDGETS: { id: ClockWidgetId; label: string }[] = [
  { id: 'weather', label: 'Weather' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'todo', label: 'To-do' },
  { id: 'sports', label: 'Sports' },
  { id: 'fantasy', label: 'Fantasy' }
]

export interface ClockSettings {
  tabStyle: ClockStyle
  sleepStyle: ClockStyle
  widgets: { order: ClockWidgetId[]; hidden: ClockWidgetId[] }
  defaultAlert: TimerAlert
  keyDebug: boolean
}

export interface ClockPayload {
  tabStyle: ClockStyle
  sleepStyle: ClockStyle
  widgets: ClockWidgetId[]
  keyDebug: boolean
}

const KEY = 'clockSettings'
const LAST_ALERT_KEY = 'clockLastAlert'
const LAST_MINUTES_KEY = 'clockLastMinutes'
const DEFAULT_MINUTES = 5

const STYLES: ClockStyle[] = ['digital', 'analog']
const ALERTS: TimerAlert[] = ['off', 'notify', 'sound']
const WIDGET_IDS = CLOCK_WIDGETS.map(w => w.id)

const style = (v: unknown): ClockStyle =>
  STYLES.includes(v as ClockStyle) ? (v as ClockStyle) : 'digital'

const isAlert = (v: unknown): v is TimerAlert =>
  ALERTS.includes(v as TimerAlert)

function widgetIds(value: unknown): ClockWidgetId[] {
  return Array.isArray(value)
    ? value.filter((v): v is ClockWidgetId =>
        WIDGET_IDS.includes(v as ClockWidgetId)
      )
    : []
}

export function normalizeClockSettings(raw: unknown): ClockSettings {
  const r =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const w =
    r.widgets && typeof r.widgets === 'object'
      ? (r.widgets as Record<string, unknown>)
      : {}
  const order = [...new Set(widgetIds(w.order))]
  for (const id of WIDGET_IDS) if (!order.includes(id)) order.push(id)
  const wanted = new Set(widgetIds(w.hidden))
  return {
    tabStyle: style(r.tabStyle),
    sleepStyle: style(r.sleepStyle),
    widgets: { order, hidden: order.filter(id => wanted.has(id)) },
    defaultAlert: isAlert(r.defaultAlert) ? r.defaultAlert : 'notify',
    keyDebug: r.keyDebug === true
  }
}

export function getClockSettings(): ClockSettings {
  return normalizeClockSettings(getStorageValue(KEY))
}

export function setClockSettings(
  partial: Partial<ClockSettings>
): ClockSettings {
  const current = getClockSettings()
  const next = normalizeClockSettings({ ...current, ...partial })
  setStorageValue(KEY, next)
  if (next.defaultAlert !== current.defaultAlert)
    setStorageValue(LAST_ALERT_KEY, next.defaultAlert)
  return next
}

export function getLastAlert(): TimerAlert {
  const v = getStorageValue(LAST_ALERT_KEY)
  return isAlert(v) ? v : getClockSettings().defaultAlert
}

export function setLastAlert(a: unknown): void {
  if (isAlert(a)) setStorageValue(LAST_ALERT_KEY, a)
}

export function getLastMinutes(): number {
  const v = getStorageValue(LAST_MINUTES_KEY)
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_MINUTES
  return Math.min(180, Math.max(1, Math.round(v)))
}

export function setLastMinutes(n: unknown): void {
  if (typeof n !== 'number' || !Number.isFinite(n)) return
  setStorageValue(
    LAST_MINUTES_KEY,
    Math.min(180, Math.max(1, Math.round(n)))
  )
}

export function clockPayload(
  s: ClockSettings = getClockSettings()
): ClockPayload {
  const hidden = new Set(s.widgets.hidden)
  return {
    tabStyle: s.tabStyle,
    sleepStyle: s.sleepStyle,
    widgets: s.widgets.order.filter(id => !hidden.has(id)),
    keyDebug: s.keyDebug
  }
}
