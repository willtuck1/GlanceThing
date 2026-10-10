export type ClockStyle = 'digital' | 'analog'
export type TimerAlert = 'off' | 'notify' | 'sound'
export type ClockWidgetId =
  | 'weather'
  | 'calendar'
  | 'todo'
  | 'sports'
  | 'fantasy'

// Copied from src/preload/index.d.ts; keep in sync.
export interface ClockSettings {
  tabStyle: ClockStyle
  sleepStyle: ClockStyle
  widgets: { order: ClockWidgetId[]; hidden: ClockWidgetId[] }
  defaultAlert: TimerAlert
  keyDebug: boolean
}

export interface WidgetRow {
  id: ClockWidgetId
  label: string
  shown: boolean
}

type WidgetSettings = ClockSettings['widgets']

export function widgetRows(
  settings: Pick<ClockSettings, 'widgets'>,
  widgets: { id: ClockWidgetId; label: string }[]
): WidgetRow[] {
  return settings.widgets.order.map(id => ({
    id,
    label: widgets.find(w => w.id === id)?.label ?? id,
    shown: !settings.widgets.hidden.includes(id)
  }))
}

export function toggleWidget(
  settings: Pick<ClockSettings, 'widgets'>,
  id: ClockWidgetId
): { widgets: WidgetSettings } {
  const { order, hidden } = settings.widgets
  return {
    widgets: {
      order: [...order],
      hidden: hidden.includes(id)
        ? hidden.filter(h => h !== id)
        : [...hidden, id]
    }
  }
}

export function moveWidget(
  settings: Pick<ClockSettings, 'widgets'>,
  id: ClockWidgetId,
  delta: -1 | 1
): { widgets: WidgetSettings } {
  const { order, hidden } = settings.widgets
  const next = [...order]
  const from = next.indexOf(id)
  const to = from + delta
  if (from !== -1 && to >= 0 && to < next.length) {
    next.splice(from, 1)
    next.splice(to, 0, id)
  }
  return { widgets: { order: next, hidden: [...hidden] } }
}
