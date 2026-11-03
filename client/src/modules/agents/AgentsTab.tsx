import { useContext, useEffect, useRef, useState } from 'react'

import { AppBlurContext } from '@/contexts/AppBlurContext.tsx'
import { useAgents } from '@/contexts/AgentsContext.tsx'
import { useNow } from '@/contexts/ClockContext.tsx'

import { accumulateWheel } from '../clock/timerControls.ts'

import {
  cardDetail,
  formatElapsed,
  parseAgentsPayload,
  STATE_COLOR,
  STATE_WORD,
  summary,
  visibleCards
} from './view.ts'

import styles from './AgentsTab.module.css'

const VISIBLE_ROWS = 4
const CARD_STRIDE = 88
const VIEWPORT_H = 352

const AgentsTab: React.FC<{ active: boolean }> = ({ active }) => {
  const { payload } = useAgents()
  const { blurred, playerShown } = useContext(AppBlurContext)
  const now = useNow(15000)
  const [scroll, setScroll] = useState(0)

  const parsed = parseAgentsPayload(payload)
  const { cards, more } = parsed
    ? visibleCards(parsed.sessions, 12)
    : { cards: [], more: 0 }
  const maxScroll = Math.max(0, cards.length - VISIBLE_ROWS)
  const offset = Math.min(scroll, maxScroll)

  const maxRef = useRef(maxScroll)
  maxRef.current = maxScroll
  const listening = active && !blurred && !playerShown

  // Back to the top on activation and when a new session starts waiting,
  // so an auto-jump never lands with the waiting card above the viewport.
  const waiting = parsed ? parsed.counts.waiting : 0
  const prev = useRef({ active: false, waiting: 0 })
  useEffect(() => {
    const p = prev.current
    if ((active && !p.active) || waiting > p.waiting) setScroll(0)
    prev.current = { active, waiting }
  }, [active, waiting])

  useEffect(() => {
    if (!listening) return
    let acc = 0
    const wheel = (e: WheelEvent) => {
      const r = accumulateWheel(acc, e.deltaX || e.deltaY)
      acc = r.acc
      if (!r.step) return
      setScroll(s =>
        Math.max(0, Math.min(maxRef.current, s + (r.step > 0 ? 1 : -1)))
      )
    }
    document.addEventListener('wheel', wheel)
    return () => document.removeEventListener('wheel', wheel)
  }, [listening])

  if (!parsed || cards.length === 0) {
    return (
      <div className={styles.tab}>
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No agents running</div>
          <div className={styles.emptyHint}>
            Install the hooks from Settings → Agents on your computer.
          </div>
        </div>
      </div>
    )
  }

  const total = cards.length
  const thumbH = Math.max(
    24,
    Math.round((VIEWPORT_H * VISIBLE_ROWS) / total)
  )
  const thumbTop =
    maxScroll > 0
      ? Math.round((offset / maxScroll) * (VIEWPORT_H - thumbH))
      : 0

  return (
    <div className={styles.tab}>
      <div className={styles.summary}>{summary(parsed.counts)}</div>
      <div className={styles.viewport}>
        <div style={{ marginTop: -offset * CARD_STRIDE }}>
          {cards.map(c => {
            const color = STATE_COLOR[c.state]
            const detail = cardDetail(c)
            return (
              <div
                key={c.key}
                className={
                  c.state === 'waiting'
                    ? `${styles.card} ${styles.waiting}`
                    : styles.card
                }
              >
                <div
                  className={
                    c.state === 'waiting'
                      ? `${styles.bar} ${styles.pulse}`
                      : styles.bar
                  }
                  style={{ background: color }}
                />
                <div className={styles.body}>
                  <div className={styles.line1}>
                    <span className={styles.label}>
                      {c.label || c.sourceLabel}
                    </span>
                    <span className={styles.tag}>{c.sourceLabel}</span>
                  </div>
                  <div className={styles.line2}>
                    <span
                      className={
                        c.state === 'waiting'
                          ? styles.stateWaiting
                          : undefined
                      }
                      style={c.state === 'idle' ? undefined : { color }}
                    >
                      {STATE_WORD[c.state]}
                    </span>
                    {detail ? ` · ${detail}` : ''}
                  </div>
                </div>
                {now !== null && (
                  <div className={styles.elapsed}>
                    {formatElapsed(now - c.sinceMs)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {total > VISIBLE_ROWS && (
          <div className={styles.track}>
            <div
              className={styles.thumb}
              style={{ height: thumbH, top: thumbTop }}
            />
          </div>
        )}
      </div>
      {more > 0 && <div className={styles.more}>+{more} more</div>}
    </div>
  )
}

export default AgentsTab
