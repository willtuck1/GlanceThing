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

// Scrolls only the row's own list container. scrollIntoView() would also
// scroll the (overflow: hidden) TabPager sideways.
function scrollRowIntoView(row: HTMLElement) {
  const container = row.closest<HTMLElement>('[data-scroll-container]')
  if (!container) return

  const rowRect = row.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  if (rowRect.top < containerRect.top) {
    container.scrollTop -= containerRect.top - rowRect.top
  } else if (rowRect.bottom > containerRect.bottom) {
    container.scrollTop += rowRect.bottom - containerRect.bottom
  }
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
    if (highlighted && ref.current) scrollRowIntoView(ref.current)
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
