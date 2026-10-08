import { useEffect, useRef, useState } from 'react'

const WHEEL_THRESHOLD = 40

// Dial turn moves a highlight, dial press activates it. Only listens while
// the tab is active.
export function useListNav(
  count: number,
  active: boolean,
  onActivate?: (index: number) => void
) {
  const [index, setIndex] = useState(0)
  const accumulated = useRef(0)
  const activateRef = useRef(onActivate)
  activateRef.current = onActivate

  useEffect(() => {
    if (index > 0 && index >= count) setIndex(Math.max(0, count - 1))
  }, [count, index])

  useEffect(() => {
    if (!active) return

    const wheel = (e: WheelEvent) => {
      accumulated.current += e.deltaX || e.deltaY
      if (Math.abs(accumulated.current) < WHEEL_THRESHOLD) return
      const step = accumulated.current > 0 ? 1 : -1
      accumulated.current = 0
      setIndex(i =>
        Math.min(Math.max(i + step, 0), Math.max(count - 1, 0))
      )
    }

    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') activateRef.current?.(index)
    }

    document.addEventListener('wheel', wheel)
    document.addEventListener('keydown', key)

    return () => {
      document.removeEventListener('wheel', wheel)
      document.removeEventListener('keydown', key)
    }
  }, [active, count, index])

  return index
}
