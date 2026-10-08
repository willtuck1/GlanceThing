import { useEffect, useRef } from 'react'

import { scrollRowIntoView } from './scrollRowIntoView.ts'

import styles from './ListRow.module.css'

interface ListRowProps {
  title: string
  subtitle?: string
  trailing?: string
  accent?: string
  // Shown instead of the accent bar, e.g. a checkbox.
  leading?: React.ReactNode
  highlighted?: boolean
  dim?: boolean
  strike?: boolean
  // Briefly marks the row red, e.g. after a failed change.
  error?: boolean
  onClick?: () => void
}

const ListRow: React.FC<ListRowProps> = ({
  title,
  subtitle,
  trailing,
  accent,
  leading,
  highlighted,
  dim,
  strike,
  error,
  onClick
}) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted && ref.current) scrollRowIntoView(ref.current)
  }, [highlighted])

  return (
    <div
      ref={ref}
      className={styles.row}
      data-highlighted={!!highlighted}
      data-dim={!!dim}
      data-strike={!!strike}
      data-error={!!error}
      onClick={onClick}
    >
      {leading ?? (
        <div
          className={styles.accent}
          style={{ backgroundColor: accent ?? 'transparent' }}
        />
      )}
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
    </div>
  )
}

export default ListRow
