import { useEffect, useState } from 'react'

import Clock from '@/components/Clock/Clock.tsx'
import { useClock, useNow } from '@/contexts/ClockContext.tsx'
import { useFeed } from '@/hooks/useFeed.ts'
import { burnInOffset, selectWidgets } from '@/lib/widgets.ts'

import type { FeedPayload } from '@/types/Feeds.ts'

import styles from './SleepClock.module.css'

const BURN_IN_MS = 3 * 60 * 1000
const ALL_IDS = ['weather', 'calendar', 'todo', 'sports', 'fantasy']

const useWidgetFeeds = (ids: string[]) => {
  const on = (id: string) => ids.indexOf(id) !== -1
  const weather = useFeed<unknown>('weather', on('weather')).payload
  const calendar = useFeed<unknown>('calendar', on('calendar')).payload
  const todo = useFeed<unknown>('todo', on('todo')).payload
  const sports = useFeed<unknown>('sports', on('sports')).payload
  const fantasy = useFeed<unknown>('fantasy', on('fantasy')).payload
  return { weather, calendar, todo, sports, fantasy } as Record<
    string,
    FeedPayload<unknown> | null
  >
}

const SleepClock: React.FC = () => {
  const { clock, timeStrings } = useClock()
  const now = useNow(30000)
  const [n, setN] = useState(0)
  const ids = clock.widgets.filter(id => ALL_IDS.indexOf(id) !== -1)
  const feeds = useWidgetFeeds(ids)

  useEffect(() => {
    const id = setInterval(() => setN(v => v + 1), BURN_IN_MS)
    return () => clearInterval(id)
  }, [])

  const widgets = selectWidgets(ids, feeds, now).slice(0, 5)
  const off = burnInOffset(n)

  return (
    <div className={styles.layer}>
      <div
        className={styles.inner}
        style={{ transform: `translate(${off.x}px, ${off.y}px)` }}
      >
        <div
          className={`${styles.clockArea} ${widgets.length === 0 ? styles.centered : ''}`}
        >
          <div className={styles.clockBox}>
            <Clock
              style={clock.sleepStyle}
              size="sleep"
              showSeconds={false}
            />
            {clock.sleepStyle === 'digital' && timeStrings.date && (
              <div className={styles.date}>{timeStrings.date}</div>
            )}
          </div>
        </div>
        {widgets.length > 0 && (
          <div className={styles.widgets}>
            {widgets.map(w => (
              <div key={w.id} className={styles.widget}>
                <div className={styles.line1}>{w.line1}</div>
                <div className={styles.line2}>{w.line2}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SleepClock
