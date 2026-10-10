import type { ConnectorView } from '@/types/Feeds.ts'

import styles from './Connector.module.css'

type KeyValueView = Extract<ConnectorView, { layout: 'keyvalue' }>

const KeyValue: React.FC<{ view: KeyValueView }> = ({ view }) => (
  <div>
    {view.pairs.map((p, i) => (
      <div key={i} className={styles.pair}>
        <div className={styles.pairLabel}>{p.label}</div>
        <div className={styles.pairValue}>{p.value}</div>
      </div>
    ))}
  </div>
)

export default KeyValue
