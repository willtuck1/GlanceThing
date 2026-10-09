import { memo } from 'react'

import { useFeed } from '@/hooks/useFeed.ts'
import { useListNav } from '@/hooks/useListNav.ts'

import ListRow from '@/components/ListRow/ListRow.tsx'
import StaleBadge from '@/components/StaleBadge/StaleBadge.tsx'

import type { CalendarEvent } from '@/types/Feeds.ts'

import styles from '../tab.module.css'

const Calendar: React.FC<{ active: boolean }> = ({ active }) => {
  const feed = useFeed<CalendarEvent>('calendar', active)
  const highlighted = useListNav(feed.items.length, active)

  return (
    <div className={styles.tab} data-scroll-container>
      <StaleBadge stale={feed.stale} label={feed.fetchedAtLabel} />
      {feed.loaded && feed.items.length === 0 && (
        // The host's error says what to do, e.g. "Connect Google in the
        // desktop app".
        <div className={styles.empty}>{feed.error ?? 'Nothing coming up'}</div>
      )}
      {feed.items.map((event, i) => {
        const showDay =
          i === 0 || feed.items[i - 1].dayLabel !== event.dayLabel
        return (
          <div key={event.id}>
            {showDay && (
              <div className={styles.heading}>{event.dayLabel}</div>
            )}
            <ListRow
              title={event.title}
              subtitle={event.location}
              trailing={event.allDay ? 'All day' : event.startLabel}
              accent={event.calendarColor}
              highlighted={active && i === highlighted}
            />
          </div>
        )
      })}
    </div>
  )
}

// Memoized so drags and pushes for other tabs don't re-render this one.
export default memo(Calendar)
