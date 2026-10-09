import { useContext, useEffect, useRef, useState } from 'react'

import { SocketContext } from '@/contexts/SocketContext.tsx'

import type { FeedPayload, FeedType } from '@/types/Feeds.ts'

export function useFeed<T, P extends FeedPayload<T> = FeedPayload<T>>(
  type: FeedType,
  active: boolean
) {
  const { ready, socket } = useContext(SocketContext)
  const [payload, setPayload] = useState<P | null>(null)
  const lastRaw = useRef<string | null>(null)

  useEffect(() => {
    if (!ready || !socket) return

    const listener = (e: MessageEvent) => {
      // A repeat of the last push (e.g. the answer to a tab-focus request)
      // would re-render the whole list for nothing.
      if (e.data === lastRaw.current) return
      const message = JSON.parse(e.data)
      if (message.type !== type || message.action) return
      lastRaw.current = e.data
      setPayload(message.data)
    }

    socket.addEventListener('message', listener)

    return () => {
      socket.removeEventListener('message', listener)
    }
  }, [ready, socket, type])

  useEffect(() => {
    if (!ready || !socket || !active) return
    socket.send(JSON.stringify({ type }))
  }, [ready, socket, active, type])

  return {
    items: payload?.items ?? [],
    loaded: payload !== null,
    stale: !ready || payload === null || payload.stale,
    fetchedAtLabel: payload?.fetchedAtLabel ?? '',
    error: payload?.error ?? null,
    // The raw payload, for feeds that send extra fields (e.g. favorites).
    payload
  }
}
