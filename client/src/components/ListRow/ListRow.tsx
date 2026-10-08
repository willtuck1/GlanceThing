import { useEffect, useRef } from 'react'

import styles from './ListRow.module.css'

interface ListRowProps {
  title: string
  subtitle?: string
  trailing?: string
  accent?: string
  highlighted?: boolean
  dim?: boolean
  onClick?: () => void
}

const ListRow: React.FC<ListRowProps> = ({
  title,
  subtitle,
  trailing,
  accent,
  highlighted,
  dim,
  onClick
}) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  return (
    <div
      ref={ref}
      className={styles.row}
      data-highlighted={!!highlighted}
      data-dim={!!dim}
      onClick={onClick}
    >
      <div
        className={styles.accent}
        style={{ backgroundColor: accent ?? 'transparent' }}
      />
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
    </div>
  )
}

export default ListRow
