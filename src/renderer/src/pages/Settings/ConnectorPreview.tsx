import React from 'react'

import styles from './Settings.module.css'

import { ConnectorView } from './connectorForm.js'

const ConnectorPreview: React.FC<{ view: ConnectorView }> = ({ view }) => {
  const row = (
    key: string,
    left: string,
    right?: string,
    sub?: string
  ) => (
    <div key={key} className={styles.previewRow}>
      <span>
        {left}
        {sub ? ` (${sub})` : ''}
      </span>
      <span>{right}</span>
    </div>
  )
  return (
    <div className={styles.preview}>
      <p className={styles.success}>Mapped OK</p>
      {view.layout === 'list' && (
        <>
          {view.rows.map((r, i) =>
            row(String(i), r.primary, r.value, r.secondary)
          )}
          {view.more > 0 && <span>+{view.more} more</span>}
        </>
      )}
      {view.layout === 'grid' && (
        <>
          {view.cells.map((c, i) => row(String(i), c.label, c.value))}
          {view.more > 0 && <span>+{view.more} more</span>}
        </>
      )}
      {view.layout === 'number' && (
        <>
          <span className={styles.big}>
            {view.value}
            {view.unit ? ` ${view.unit}` : ''}
          </span>
          {view.caption && <span>{view.caption}</span>}
        </>
      )}
      {view.layout === 'keyvalue' &&
        view.pairs.map((p, i) => row(String(i), p.label, p.value))}
    </div>
  )
}

export default ConnectorPreview
