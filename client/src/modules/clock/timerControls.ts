// Pure dial/press logic for the Clock tab timer. The host owns the timer;
// this only drafts a start request locally and maps presses to commands.

export type Alert = 'off' | 'notify' | 'sound'
export type Mode = 'view' | 'minutes' | 'alert' | 'pausedChoice'

export interface TimerUi {
  mode: Mode
  minutes: number
  alert: Alert
  choice: 'resume' | 'reset'
  lastInputAt: number
}

export type Input = 'turnUp' | 'turnDown' | 'press' | 'tick'

export interface TimerState {
  state: 'idle' | 'running' | 'paused' | 'ringing'
  lastAlert?: unknown
  lastMinutes?: number
}

export interface Command {
  action: string
  data?: unknown
}

export const WHEEL_STEP = 40
export const IDLE_TIMEOUT_MS = 20000
export const DEFAULT_MINUTES = 5
export const MIN_MINUTES = 1
export const MAX_MINUTES = 180
export const ALERTS: Alert[] = ['off', 'notify', 'sound']

export const initialUi = (): TimerUi => ({
  mode: 'view',
  minutes: DEFAULT_MINUTES,
  alert: 'notify',
  choice: 'resume',
  lastInputAt: 0
})

const isAlert = (v: unknown): v is Alert =>
  v === 'off' || v === 'notify' || v === 'sound'

export const stepMinutes = (minutes: number, dir: 1 | -1): number => {
  // Below 60 steps by 1; at or above 60 steps by 5 (59 +1 -> 60).
  const size = dir === 1 ? (minutes >= 60 ? 5 : 1) : minutes > 60 ? 5 : 1
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutes + dir * size))
}

export const cycleAlert = (alert: Alert, dir: 1 | -1): Alert =>
  ALERTS[(ALERTS.indexOf(alert) + dir + ALERTS.length) % ALERTS.length]

/** Accumulates wheel deltaY; returns +1/-1 once |sum| reaches the step. */
export const accumulateWheel = (
  acc: number,
  delta: number
): { acc: number; step: 0 | 1 | -1 } => {
  const sum = acc + delta
  if (Math.abs(sum) < WHEEL_STEP) return { acc: sum, step: 0 }
  return { acc: 0, step: sum > 0 ? 1 : -1 }
}

export const step = (
  ui: TimerUi,
  input: Input,
  timer: TimerState,
  now = 0
): { ui: TimerUi; command?: Command } => {
  const touched = { ...ui, lastInputAt: now }

  if (timer.state === 'ringing') return { ui }

  if (timer.state === 'running') {
    if (input === 'press') {
      return {
        ui: { ...initialUi(), lastInputAt: now },
        command: { action: 'pause' }
      }
    }
    return { ui: ui.mode === 'view' ? ui : { ...ui, mode: 'view' } }
  }

  if (timer.state === 'paused') {
    const choice = ui.mode === 'pausedChoice' ? ui.choice : 'resume'
    if (input === 'turnUp' || input === 'turnDown') {
      return {
        ui: {
          ...touched,
          mode: 'pausedChoice',
          choice: choice === 'resume' ? 'reset' : 'resume'
        }
      }
    }
    if (input === 'press') {
      return {
        ui: { ...initialUi(), lastInputAt: now },
        command: { action: choice }
      }
    }
    return {
      ui: ui.mode === 'pausedChoice' ? ui : { ...ui, mode: 'pausedChoice' }
    }
  }

  // idle
  const mode: Mode =
    ui.mode === 'minutes' || ui.mode === 'alert' ? ui.mode : 'view'

  if (input === 'tick') {
    if (mode !== 'view' && now - ui.lastInputAt >= IDLE_TIMEOUT_MS)
      return { ui: { ...ui, mode: 'view' } }
    return { ui: mode === ui.mode ? ui : { ...ui, mode } }
  }

  if (mode === 'view') {
    return {
      ui: {
        ...touched,
        mode: 'minutes',
        minutes: timer.lastMinutes ?? DEFAULT_MINUTES,
        alert: isAlert(timer.lastAlert) ? timer.lastAlert : 'notify'
      }
    }
  }

  if (mode === 'minutes') {
    if (input === 'press') return { ui: { ...touched, mode: 'alert' } }
    return {
      ui: {
        ...touched,
        mode,
        minutes: stepMinutes(ui.minutes, input === 'turnUp' ? 1 : -1)
      }
    }
  }

  // alert
  if (input === 'press') {
    return {
      ui: { ...touched, mode: 'view' },
      command: {
        action: 'start',
        data: { minutes: ui.minutes, alert: ui.alert }
      }
    }
  }
  return {
    ui: {
      ...touched,
      mode,
      alert: cycleAlert(ui.alert, input === 'turnUp' ? 1 : -1)
    }
  }
}
