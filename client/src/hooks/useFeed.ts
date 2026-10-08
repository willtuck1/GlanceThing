import { useContext, useEffect, useState } from 'react'

import { SocketContext } from '@/contexts/SocketContext.tsx'

import type { FeedPayload, FeedType } from '@/types/Feeds.ts'

export function useFeed<T, P extends FeedPayload<T> = FeedPayload<T>>(
  type: FeedType,
  active: boolean
) {
  const { ready, socket } = useContext(SocketContext)
  const [payload, setPayload] = useState<P | null>(null)

  useEffect(() => {
    if (!ready || !socket) return

    const listener = (e: MessageEvent) => {
      const message = JSON.parse(e.data)
      if (message.type !== type || message.action) return
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
