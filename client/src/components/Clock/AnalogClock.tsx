import { handAngles } from '@/lib/clockTime.ts'

import styles from './Clock.module.css'

interface AnalogClockProps {
  size: 'tab' | 'sleep'
  fields: { h: number; m: number; s: number } | null
  showSeconds: boolean
}

const TICKS = Array.from({ length: 12 }, (_, i) => i * 30)

const AnalogClock: React.FC<AnalogClockProps> = ({
  size,
  fields,
  showSeconds
}) => {
  const px = size === 'tab' ? 300 : 380
  const a = fields ? handAngles(fields.h, fields.m, fields.s) : null

  return (
    <svg
      className={styles.analog}
      width={px}
      height={px}
      viewBox="0 0 200 200"
    >
      <circle
        cx="100"
        cy="100"
        r="96"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      {TICKS.map(t => (
        <line
          key={t}
          x1="100"
          y1="10"
          x2="100"
          y2={t % 90 === 0 ? 24 : 18}
          stroke="currentColor"
          strokeWidth={t % 90 === 0 ? 4 : 2}
          strokeLinecap="round"
          transform={`rotate(${t} 100 100)`}
        />
      ))}
      {a ? (
        <>
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="56"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            transform={`rotate(${a.hour} 100 100)`}
          />
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="30"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            transform={`rotate(${a.minute} 100 100)`}
          />
          {showSeconds ? (
            <line
              x1="100"
              y1="112"
              x2="100"
              y2="22"
              stroke="#e5484d"
              strokeWidth="2"
              strokeLinecap="round"
              transform={`rotate(${a.second} 100 100)`}
            />
          ) : null}
          <circle cx="100" cy="100" r="5" fill="currentColor" />
        </>
      ) : null}
    </svg>
  )
}

export default AnalogClock
