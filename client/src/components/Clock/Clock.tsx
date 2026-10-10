import { useClock, useNow } from '@/contexts/ClockContext.tsx'
import { localFields } from '@/lib/clockTime.ts'

import DigitalClock from './DigitalClock.tsx'
import AnalogClock from './AnalogClock.tsx'

interface ClockProps {
  style: 'digital' | 'analog'
  size: 'tab' | 'sleep'
  showSeconds: boolean
}

const Clock: React.FC<ClockProps> = ({ style, size, showSeconds }) => {
  const { anchor, timeStrings } = useClock()
  const now = useNow(showSeconds ? 1000 : 15000)
  const f =
    anchor && now !== null ? localFields(now, anchor.offsetMin) : null
  const hour12 = anchor ? anchor.hour12 : false

  if (style === 'analog')
    return <AnalogClock size={size} fields={f} showSeconds={showSeconds} />
  return (
    <DigitalClock
      size={size}
      fields={f}
      hour12={hour12}
      fallback={timeStrings.time}
      showSeconds={showSeconds}
    />
  )
}

export default Clock
