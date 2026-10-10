import { useContext, useEffect, useRef, useState } from 'react'

import { useClock } from '@/contexts/ClockContext.tsx'
import { SocketContext } from '@/contexts/SocketContext.tsx'

interface Entry {
  id: number
  text: string
}

const KeyDebug: React.FC = () => {
  const { clock } = useClock()
  const { socket } = useContext(SocketContext)
  const [entries, setEntries] = useState<Entry[]>([])
  const counter = useRef(0)
  const enabled = clock.keyDebug

  useEffect(() => {
    if (!enabled) return

    const log = (text: string, data: Record<string, unknown>) => {
      counter.current += 1
      const id = counter.current
      setEntries(prev => prev.concat({ id, text }).slice(-5))
      if (socket && socket.readyState === 1)
        socket.send(JSON.stringify({ type: 'keylog', data }))
    }

    const onKey = (e: KeyboardEvent) => {
      const kind = e.type
      const data = {
        kind,
        key: e.key,
        code: e.code,
        keyCode: e.keyCode
      }
      log(`${kind} ${e.key} ${e.code} ${e.keyCode}`, data)
    }
    const onWheel = (e: WheelEvent) => {
      log(`wheel dx=${e.deltaX} dy=${e.deltaY}`, {
        kind: 'wheel',
        dx: e.deltaX,
        dy: e.deltaY
      })
    }

    const opts = { capture: true, passive: true }
    window.addEventListener('keydown', onKey, opts)
    window.addEventListener('keyup', onKey, opts)
    window.addEventListener('wheel', onWheel, opts)
    return () => {
      window.removeEventListener('keydown', onKey, opts)
      window.removeEventListener('keyup', onKey, opts)
      window.removeEventListener('wheel', onWheel, opts)
    }
  }, [enabled, socket])

  if (!enabled) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 30000,
        fontSize: 12,
        lineHeight: '16px',
        color: '#0f0',
        background: 'rgba(0,0,0,0.7)',
        padding: 4,
        pointerEvents: 'none'
      }}
    >
      {entries.map(e => (
        <div key={e.id}>{e.text}</div>
      ))}
    </div>
  )
}

export default KeyDebug
