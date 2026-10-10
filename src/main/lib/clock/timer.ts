import type { TimerAlert } from './settings.js'

export type { TimerAlert }
export type TimerState = 'idle' | 'running' | 'paused' | 'ringing'

export interface TimerPayload {
  state: TimerState
  durationMs: number
  remainingMs: number
  alert: TimerAlert
  lastAlert: TimerAlert
  lastMinutes: number
}

export interface TimerDeps {
  /** Monotonic milliseconds. */
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  broadcast(payload: TimerPayload): void
  desktopAlert(alert: TimerAlert, durationMs: number): void
  getLastAlert(): TimerAlert
  setLastAlert(alert: TimerAlert): void
  getLastMinutes(): number
  setLastMinutes(minutes: number): void
}

const ALERTS: TimerAlert[] = ['off', 'notify', 'sound']

export function createTimer(deps: TimerDeps) {
  let state: TimerState = 'idle'
  let durationMs = 0
  let remainingMs = 0
  let endsAt = 0
  let alert: TimerAlert = 'off'
  let handle: unknown = null

  function clear() {
    if (handle !== null) deps.clearTimeout(handle)
    handle = null
  }

  function payload(): TimerPayload {
    if (state === 'idle') {
      return {
        state,
        durationMs: 0,
        remainingMs: 0,
        alert: deps.getLastAlert(),
        lastAlert: deps.getLastAlert(),
        lastMinutes: deps.getLastMinutes()
      }
    }
    return {
      state,
      durationMs,
      remainingMs:
        state === 'running'
          ? Math.max(0, endsAt - deps.now())
          : remainingMs,
      alert,
      lastAlert: deps.getLastAlert(),
      lastMinutes: deps.getLastMinutes()
    }
  }

  function emit() {
    deps.broadcast(payload())
  }

  function schedule(ms: number) {
    clear()
    endsAt = deps.now() + ms
    handle = deps.setTimeout(finish, ms)
  }

  function finish() {
    handle = null
    if (state !== 'running') return
    state = 'ringing'
    remainingMs = 0
    deps.desktopAlert(alert, durationMs)
    emit()
  }

  function toIdle() {
    clear()
    state = 'idle'
    durationMs = 0
    remainingMs = 0
  }

  return {
    payload,
    start(data: unknown) {
      const d = data as { minutes?: unknown; alert?: unknown } | null
      const valid =
        !!d &&
        typeof d === 'object' &&
        typeof d.minutes === 'number' &&
        Number.isInteger(d.minutes) &&
        d.minutes >= 1 &&
        d.minutes <= 180 &&
        ALERTS.includes(d.alert as TimerAlert)
      if (!valid || (state !== 'idle' && state !== 'ringing')) {
        emit()
        return
      }
      if (state === 'ringing') toIdle()
      const { minutes, alert: a } = d as {
        minutes: number
        alert: TimerAlert
      }
      state = 'running'
      durationMs = minutes * 60000
      remainingMs = durationMs
      alert = a
      deps.setLastAlert(a)
      deps.setLastMinutes(minutes)
      schedule(durationMs)
      emit()
    },
    pause() {
      if (state === 'running') {
        remainingMs = Math.max(0, endsAt - deps.now())
        clear()
        state = 'paused'
      }
      emit()
    },
    resume() {
      if (state === 'paused') {
        state = 'running'
        schedule(remainingMs)
      }
      emit()
    },
    reset() {
      if (state !== 'idle') toIdle()
      emit()
    },
    dismiss() {
      if (state === 'ringing') toIdle()
      emit()
    },
    dispose() {
      clear()
    }
  }
}
