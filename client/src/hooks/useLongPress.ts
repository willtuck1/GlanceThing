import { useEffect, useRef } from 'react'

const MOVE_SLOP_PX = 10

// Touch long-press that also swallows the click a swipe or long-press would
// otherwise produce (TabPager swipes are transforms, so the browser still
// fires click after them).
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const callback = useRef(onLongPress)
  callback.current = onLongPress

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  useEffect(() => cancel, [])

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY }
      suppressClick.current = false
      cancel()
      timer.current = setTimeout(() => {
        timer.current = null
        suppressClick.current = true
        callback.current()
      }, ms)
    },
    onTouchMove: (e: React.TouchEvent) => {
      const s = start.current
      if (!s) return
      const t = e.touches[0]
      if (
        Math.abs(t.clientX - s.x) > MOVE_SLOP_PX ||
        Math.abs(t.clientY - s.y) > MOVE_SLOP_PX
      ) {
        suppressClick.current = true
        cancel()
      }
    },
    onTouchEnd: () => {
      cancel()
      start.current = null
    },
    onTouchCancel: () => {
      cancel()
      start.current = null
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!suppressClick.current) return
      suppressClick.current = false
      e.stopPropagation()
      e.preventDefault()
    }
  }
}
