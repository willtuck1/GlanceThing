import { useListNav } from '@/hooks/useListNav.ts'

import ListRow from '@/components/ListRow/ListRow.tsx'
import { moreLabel } from './view.ts'

import type { ConnectorView } from '@/types/Feeds.ts'

import styles from './Connector.module.css'

type ListView = Extract<ConnectorView, { layout: 'list' }>

const List: React.FC<{ view: ListView; active: boolean }> = ({
  view,
  active
}) => {
  const highlighted = useListNav(view.rows.length, active)

  return (
    <div>
      {view.rows.map((row, i) => (
        <ListRow
          key={i}
          title={row.primary}
          subtitle={row.secondary}
          trailing={row.value}
          highlighted={active && i === highlighted}
        />
      ))}
      {view.more > 0 && (
        <div className={styles.more}>{moreLabel(view.more)}</div>
      )}
    </div>
  )
}

export default List
