import { moreLabel } from './view.ts'

import type { ConnectorView } from '@/types/Feeds.ts'

import styles from './Connector.module.css'

type GridView = Extract<ConnectorView, { layout: 'grid' }>

const Grid: React.FC<{ view: GridView }> = ({ view }) => (
  <div>
    <div className={styles.grid}>
      {view.cells.slice(0, 12).map((c, i) => (
        <div key={i} className={styles.cellOuter}>
          <div className={styles.cell}>
            <div className={styles.cellLabel}>{c.label}</div>
            <div className={styles.cellValue}>{c.value}</div>
          </div>
        </div>
      ))}
    </div>
    {view.more > 0 && (
      <div className={styles.more}>{moreLabel(view.more)}</div>
    )}
  </div>
)

export default Grid
