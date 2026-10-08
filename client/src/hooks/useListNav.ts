import { useContext, useEffect, useRef, useState } from 'react'

import { AppBlurContext } from '@/contexts/AppBlurContext.tsx'

const WHEEL_THRESHOLD = 40

// Dial turn moves a highlight, dial press activates it. Only listens while
// the tab is active and no overlay (e.g. the Menu) has blurred the app.
// Pass `keys` (one per row) to keep the highlight on the same row when the
// list reorders.
export function useListNav(
  count: number,
  active: boolean,
  onActivate?: (index: number) => void,
  keys?: string[]
) {
  const [index, setIndex] = useState(0)
  const accumulated = useRef(0)
  const activateRef = useRef(onActivate)
  activateRef.current = onActivate

  const { blurred } = useContext(AppBlurContext)
  const blurredRef = useRef(blurred)
  blurredRef.current = blurred

  const keysRef = useRef(keys)
  keysRef.current = keys
  const highlightedKey = useRef<string | null>(null)
  const keysSignature = keys?.join('\n')

  useEffect(() => {
    if (index > 0 && index >= count) setIndex(Math.max(0, count - 1))
  }, [count, index])

  // The user moved the highlight: remember which row it is on.
  useEffect(() => {
    highlightedKey.current = keysRef.current?.[index] ?? null
  }, [index])

  // The rows changed: follow the highlighted row to its new position.
  useEffect(() => {
    const current = keysRef.current
    if (!current) return
    if (highlightedKey.current === null) {
      highlightedKey.current = current[index] ?? null
      return
    }
    const moved = current.indexOf(highlightedKey.current)
    if (moved >= 0 && moved !== index) setIndex(moved)
    // Only re-run when the row order changes, not when index does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSignature])

  useEffect(() => {
    if (!active) return

    const wheel = (e: WheelEvent) => {
      if (blurredRef.current) return
      accumulated.current += e.deltaX || e.deltaY
      if (Math.abs(accumulated.current) < WHEEL_THRESHOLD) return
      const step = accumulated.current > 0 ? 1 : -1
      accumulated.current = 0
      setIndex(i =>
        Math.min(Math.max(i + step, 0), Math.max(count - 1, 0))
      )
    }

    const key = (e: KeyboardEvent) => {
      if (blurredRef.current) return
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
