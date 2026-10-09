import { memo, useEffect, useRef, useState } from 'react'

import { indexAfterChange, keyToIndex } from './keys.ts'
import { AXIS_LOCK_PX, resolveSnap } from './snap.ts'

import styles from './TabPager.module.css'

export interface TabPage {
  key: string
  render: (active: boolean) => React.ReactNode
}

interface TabPagerProps {
  pages: TabPage[]
}

// Re-renders only when its own `active` flips, not on every drag frame or
// when another tab becomes active. `page` must be stable (defined once).
const Page = memo(function Page({
  page,
  active
}: {
  page: TabPage
  active: boolean
}) {
  return <>{page.render(active)}</>
})

interface Drag {
  startX: number
  startY: number
  startTime: number
  axis: 'x' | 'y' | null
}

const TabPager: React.FC<TabPagerProps> = ({ pages }) => {
  const keys = pages.map(p => p.key)
  const [indexState, setIndex] = useState(0)
  const [prevKeys, setPrevKeys] = useState(keys)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)

  // Adjust during render (not in an effect) so no render ever pairs the new
  // pages with a stale or out-of-range index.
  let index = indexState
  if (prevKeys.join('\n') !== keys.join('\n')) {
    index = indexAfterChange(prevKeys, indexState, keys)
    setPrevKeys(keys)
    setIndex(index)
  }

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const pageKeys = pages.map(p => p.key)
      setIndex(
        current => keyToIndex(e.key, current, pageKeys) ?? current
      )
    }

    document.addEventListener('keydown', listener)

    return () => {
      document.removeEventListener('keydown', listener)
    }
  }, [pages])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    drag.current = {
      startX: t.clientX,
      startY: t.clientY,
      startTime: Date.now(),
      axis: null
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current
    if (!d) return
    const t = e.touches[0]
    const dx = t.clientX - d.startX
    const dy = t.clientY - d.startY

    if (!d.axis) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX)
        return
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (d.axis === 'x') setDragging(true)
    }

    if (d.axis !== 'x') return

    // Resist dragging past the first and last page.
    const atEdge =
      (index === 0 && dx > 0) || (index === pages.length - 1 && dx < 0)
    setDragX(atEdge ? dx / 3 : dx)
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.axis !== 'x') return

    const dx = e.changedTouches[0].clientX - d.startX
    const width = containerRef.current?.clientWidth ?? 800
    setIndex(
      resolveSnap({
        dx,
        width,
        elapsedMs: Date.now() - d.startTime,
        index,
        count: pages.length
      })
    )
    setDragging(false)
    setDragX(0)
  }

  const offset = -index * (100 / pages.length)

  return (
    <div
      className={styles.pager}
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        className={styles.track}
        data-dragging={dragging}
        style={{
          width: `${pages.length * 100}%`,
          transform: `translateX(calc(${offset}% + ${dragX}px))`
        }}
      >
        {pages.map((page, i) => (
          <div
            key={page.key}
            className={styles.page}
            style={{ width: `${100 / pages.length}%` }}
          >
            <Page page={page} active={i === index} />
          </div>
        ))}
      </div>
      <div className={styles.dots}>
        {pages.map((page, i) => (
          <div
            key={page.key}
            className={styles.dot}
            data-active={i === index}
          />
        ))}
      </div>
    </div>
  )
}

export default TabPager
