import { useFeed } from '@/hooks/useFeed.ts'
import { useListNav } from '@/hooks/useListNav.ts'

import ListRow from '@/components/ListRow/ListRow.tsx'
import StaleBadge from '@/components/StaleBadge/StaleBadge.tsx'

import type { Task } from '@/types/Feeds.ts'

import styles from '../tab.module.css'

const Todo: React.FC<{ active: boolean }> = ({ active }) => {
  const feed = useFeed<Task>('todo', active)
  // Open tasks first, completed below.
  const tasks = feed.items
    .filter(t => !t.done)
    .concat(feed.items.filter(t => t.done))
  const highlighted = useListNav(tasks.length, active)

  return (
    <div className={styles.tab}>
      <StaleBadge stale={feed.stale} label={feed.fetchedAtLabel} />
      {feed.loaded && tasks.length === 0 && (
        <div className={styles.empty}>All done</div>
      )}
      {tasks.map((task, i) => (
        <ListRow
          key={task.id}
          title={task.title}
          subtitle={task.dueLabel}
          trailing={task.done ? 'Done' : ''}
          dim={task.done}
          highlighted={active && i === highlighted}
        />
      ))}
    </div>
  )
}

export default Todo
