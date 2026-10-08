import { useContext, useEffect, useMemo, useState } from 'react'

import { SocketContext } from '@/contexts/SocketContext.tsx'
import { useFeed } from '@/hooks/useFeed.ts'
import { useListNav } from '@/hooks/useListNav.ts'

import StaleBadge from '@/components/StaleBadge/StaleBadge.tsx'
import GameRow from './GameRow.tsx'

import type { Game, SportsPayload } from '@/types/Feeds.ts'

import styles from '../tab.module.css'

// Optimistic stars are dropped if the host has not confirmed within this time.
const PENDING_TIMEOUT_MS = 5000

const Sports: React.FC<{ active: boolean }> = ({ active }) => {
  const { ready, socket } = useContext(SocketContext)
  const feed = useFeed<Game, SportsPayload>('sports', active)
  const [pending, setPending] = useState<Record<string, boolean>>({})

  const serverFavorites = useMemo(
    () => feed.payload?.favorites ?? [],
    [feed.payload]
  )

  // Drop optimistic entries once the host's push agrees with them.
  useEffect(() => {
    setPending(p => {
      const next: Record<string, boolean> = {}
      for (const key of Object.keys(p)) {
        if (serverFavorites.includes(key) !== p[key]) next[key] = p[key]
      }
      // Keep the same object when nothing changed, so the timeout below is
      // not re-armed by unrelated pushes.
      return Object.keys(next).length === Object.keys(p).length ? p : next
    })
  }, [serverFavorites])

  useEffect(() => {
    if (Object.keys(pending).length === 0) return
    const t = setTimeout(() => setPending({}), PENDING_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [pending])

  const favorites = useMemo(() => {
    const set = serverFavorites.filter(k => pending[k] !== false)
    for (const key of Object.keys(pending)) {
      if (pending[key] && !set.includes(key)) set.push(key)
    }
    return set
  }, [serverFavorites, pending])

  const send = (teamKey: string, on: boolean) => {
    if (!ready || !socket) return
    setPending(p => ({ ...p, [teamKey]: on }))
    socket.send(
      JSON.stringify({
        type: 'sports',
        action: 'favorite',
        data: { teamKey, on }
      })
    )
  }

  const toggleTeam = (teamKey: string) =>
    send(teamKey, !favorites.includes(teamKey))

  // Long-press or dial press: unstar the game's starred teams, or star both.
  const toggleGame = (game: Game) => {
    const keys = [game.away.key, game.home.key]
    const starred = keys.filter(k => favorites.includes(k))
    if (starred.length > 0) starred.forEach(k => send(k, false))
    else keys.forEach(k => send(k, true))
  }

  const gameIds = useMemo(() => feed.items.map(g => g.id), [feed.items])
  const highlighted = useListNav(
    feed.items.length,
    active,
    i => {
      const game = feed.items[i]
      if (game) toggleGame(game)
    },
    gameIds
  )

  return (
    <div className={styles.tab} data-scroll-container>
      <StaleBadge stale={feed.stale} label={feed.fetchedAtLabel} />
      {feed.loaded && feed.items.length === 0 && (
        // Without any cached games, say why (e.g. the computer is offline).
        <div className={styles.empty}>{feed.error ?? 'No games today'}</div>
      )}
      {feed.items.map((game, i) => (
        <GameRow
          key={game.id}
          game={game}
          favorites={favorites}
          highlighted={active && i === highlighted}
          onToggleTeam={toggleTeam}
          onToggleGame={toggleGame}
        />
      ))}
    </div>
  )
}

export default Sports
