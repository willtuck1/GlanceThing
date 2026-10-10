export type ClockStyle = 'digital' | 'analog'

export interface ClockSettings {
  tabStyle: ClockStyle
  sleepStyle: ClockStyle
  widgets: string[]
  keyDebug: boolean
}

export const CLOCK_DEFAULTS: ClockSettings = {
  tabStyle: 'digital',
  sleepStyle: 'digital',
  widgets: ['weather', 'calendar', 'todo', 'sports', 'fantasy'],
  keyDebug: false
}

const style = (v: unknown, fallback: ClockStyle): ClockStyle =>
  v === 'digital' || v === 'analog' ? v : fallback

export const parseClock = (data: unknown): ClockSettings => {
  const d = (data ?? {}) as Record<string, unknown>
  return {
    tabStyle: style(d.tabStyle, CLOCK_DEFAULTS.tabStyle),
    sleepStyle: style(d.sleepStyle, CLOCK_DEFAULTS.sleepStyle),
    widgets: Array.isArray(d.widgets)
      ? d.widgets.filter((w): w is string => typeof w === 'string')
      : CLOCK_DEFAULTS.widgets,
    keyDebug: d.keyDebug === true
  }
}
