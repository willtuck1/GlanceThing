import { digits } from '@/lib/clockTime.ts'

import styles from './Clock.module.css'

interface Fields {
  h: number
  m: number
  s: number
}

interface DigitalClockProps {
  size: 'tab' | 'sleep'
  fields: Fields | null
  hour12: boolean
  fallback: string | null
  showSeconds: boolean
}

const Box = ({ ch }: { ch: string }) => (
  <span className={styles.digit}>{ch}</span>
)

const DigitalClock: React.FC<DigitalClockProps> = ({
  size,
  fields,
  hour12,
  fallback,
  showSeconds
}) => {
  const cls = `${styles.digital} ${size === 'tab' ? styles.tab : styles.sleep}`
  if (!fields) return <div className={cls}>{fallback}</div>

  const { hh, mm, suffix } = digits(fields.h, fields.m, hour12)
  const ss = String(fields.s).padStart(2, '0')

  return (
    <div className={cls}>
      {hh.split('').map((c, i) => (
        <Box key={i} ch={c} />
      ))}
      <span className={styles.colon}>:</span>
      {mm.split('').map((c, i) => (
        <Box key={i} ch={c} />
      ))}
      {showSeconds || suffix ? (
        <span className={styles.side}>
          {showSeconds ? (
            <span className={styles.seconds}>{ss}</span>
          ) : null}
          {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
        </span>
      ) : null}
    </div>
  )
}

export default DigitalClock
