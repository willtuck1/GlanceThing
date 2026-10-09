import type { ConnectorView } from '@/types/Feeds.ts'

import styles from './Connector.module.css'

type NumberView = Extract<ConnectorView, { layout: 'number' }>

const BigNumber: React.FC<{ view: NumberView }> = ({ view }) => (
  <div className={styles.number}>
    <div className={styles.numberLine}>
      <span className={styles.numberValue}>{view.value}</span>
      {view.unit && <span className={styles.numberUnit}>{view.unit}</span>}
    </div>
    {view.caption && (
      <div className={styles.numberCaption}>{view.caption}</div>
    )}
  </div>
)

export default BigNumber
