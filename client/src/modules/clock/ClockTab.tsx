import { useContext, useEffect, useRef, useState } from 'react'

import { AppBlurContext } from '@/contexts/AppBlurContext.tsx'
import { SocketContext } from '@/contexts/SocketContext.tsx'
import { useClock } from '@/contexts/ClockContext.tsx'
import { useLongPress } from '@/hooks/useLongPress.ts'
import { formatRemaining } from '@/lib/clockTime.ts'
import Clock from '@/components/Clock/Clock.tsx'

import { accumulateWheel, initialUi, step } from './timerControls.ts'

import type { Alert, Input, TimerUi } from './timerControls.ts'

import styles from './ClockTab.module.css'

const CHIPS: { id: Alert; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'notify', label: 'Notify' },
  { id: 'sound', label: 'Notify + sound' }
]

const ClockTab: React.FC<{ active: boolean }> = ({ active }) => {
  const { clock, timeStrings, timer, timerAt, send } = useClock()
  const { blurred, playerShown } = useContext(AppBlurContext)
  const { ready, socket } = useContext(SocketContext)

  const [ui, setUi] = useState<TimerUi>(initialUi)
  const [perf, setPerf] = useState(() => performance.now())

  const state = timer?.state ?? 'idle'
  const listening = active && !blurred && !playerShown

  const uiRef = useRef(ui)
  uiRef.current = ui
  const timerRef = useRef(timer)
  timerRef.current = timer
  const sendRef = useRef(send)
  sendRef.current = send

  const apply = (input: Input) => {
    const t = timerRef.current ?? { state: 'idle' as const }
    const r = step(uiRef.current, input, t, performance.now())
    uiRef.current = r.ui
    setUi(r.ui)
    if (r.command) sendRef.current(r.command.action, r.command.data)
  }
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    if (!listening) return
    let acc = 0
    const wheel = (e: WheelEvent) => {
      const r = accumulateWheel(acc, e.deltaX || e.deltaY)
      acc = r.acc
      if (r.step) applyRef.current(r.step > 0 ? 'turnUp' : 'turnDown')
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') applyRef.current('press')
    }
    document.addEventListener('wheel', wheel)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('wheel', wheel)
      document.removeEventListener('keydown', key)
    }
  }, [listening])

  // Drives the countdown and the 20 s draft timeout.
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setPerf(performance.now())
      applyRef.current('tick')
    }, 250)
    return () => clearInterval(id)
  }, [active])

  // Drop a stale draft when leaving the tab.
  useEffect(() => {
    if (!active) {
      uiRef.current = initialUi()
      setUi(uiRef.current)
    }
  }, [active])

  const longPress = useLongPress(() => {
    if (!ready || !socket) return
    socket.send(
      JSON.stringify({ type: 'sleep', data: { method: 'clock' } })
    )
  }, 800)

  const idleDrafting =
    state === 'idle' && (ui.mode === 'minutes' || ui.mode === 'alert')
  const remaining = timer
    ? state === 'running'
      ? Math.max(0, timer.remainingMs - (perf - timerAt))
      : timer.remainingMs
    : 0

  let big: string
  if (idleDrafting) big = `${ui.minutes} min`
  else if (state === 'idle') big = '0:00'
  else big = formatRemaining(remaining)

  const chosen: Alert = idleDrafting ? ui.alert : (timer?.alert ?? 'off')

  let hint: string
  if (state === 'running') hint = 'Press to pause'
  else if (state === 'ringing') hint = 'Press to dismiss'
  else if (state === 'paused')
    hint = `Turn: ${ui.mode === 'pausedChoice' && ui.choice === 'reset' ? 'Reset' : 'Resume'} / ${ui.mode === 'pausedChoice' && ui.choice === 'reset' ? 'Resume' : 'Reset'} · Press`
  else if (ui.mode === 'minutes')
    hint = 'Turn to set · Press to choose alert'
  else if (ui.mode === 'alert') hint = 'Turn to choose · Press to start'
  else hint = 'Turn to set a timer'

  return (
    <div className={styles.tab}>
      <div className={styles.left} {...longPress}>
        <Clock style={clock.tabStyle} size="tab" showSeconds />
        <div className={styles.date}>{timeStrings.date}</div>
      </div>
      <div className={styles.right}>
        <div
          className={styles.big}
          data-dim={state === 'idle' && !idleDrafting}
        >
          {big}
        </div>
        <div className={styles.chips}>
          {CHIPS.map(c => (
            <span
              key={c.id}
              className={styles.chip}
              data-on={c.id === chosen}
            >
              {c.label}
            </span>
          ))}
        </div>
        <div className={styles.hint}>{hint}</div>
      </div>
    </div>
  )
}

export default ClockTab
