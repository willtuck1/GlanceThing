import { useEffect, useRef } from 'react'

import { scrollRowIntoView } from './scrollRowIntoView.ts'
import { tint } from '@/lib/tint.ts'

import styles from './ListRow.module.css'

interface ListRowProps {
  title: string
  subtitle?: string
  trailing?: string
  accent?: string
  // Muted wash of this color across the whole row (#rrggbb).
  tint?: string
  // Opacity of the wash, 0-1. Defaults to the standard tint.
  tintAlpha?: number
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
  tint: tintColor,
  tintAlpha,
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

  const wash = tint(tintColor, tintAlpha)

  return (
    <div
      ref={ref}
      className={styles.row}
      data-highlighted={!!highlighted}
      data-dim={!!dim}
      data-strike={!!strike}
      data-error={!!error}
      data-tinted={!!wash}
      style={wash ? { backgroundImage: wash } : undefined}
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
