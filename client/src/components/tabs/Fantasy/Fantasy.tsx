import { useEffect, useMemo, useRef, useState } from 'react'

import { useFeed } from '@/hooks/useFeed.ts'
import { useListNav } from '@/hooks/useListNav.ts'
import { scrollRowIntoView } from '@/components/ListRow/scrollRowIntoView.ts'

import StaleBadge from '@/components/StaleBadge/StaleBadge.tsx'
import {
  benchRows,
  formatPoints,
  leader,
  MatchupRow,
  playerDetail,
  starterRows
} from './rows.ts'

import type { FantasyPlayer, FantasyView } from '@/types/Feeds.ts'

import tabStyles from '../tab.module.css'
import styles from './Fantasy.module.css'

// Keeps the highlighted row on screen. The first row also brings back the
// score card above it.
function useScrollIntoView(highlighted: boolean, first: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!highlighted || !el) return
    if (first) {
      const container = el.closest<HTMLElement>('[data-scroll-container]')
      if (container) container.scrollTop = 0
    } else {
      scrollRowIntoView(el)
    }
  }, [highlighted, first])
  return ref
}

const Side: React.FC<{
  player: FantasyPlayer | null
  ahead: boolean
  align: 'left' | 'right'
}> = ({ player, ahead, align }) => {
  const empty = !player || player.position === ''
  const points = (
    <div className={styles.points} data-ahead={ahead}>
      {player ? formatPoints(player.points) : ''}
    </div>
  )
  const info = (
    <div className={styles.player} data-align={align} data-empty={empty}>
      <div className={styles.name}>{player?.name ?? ''}</div>
      {player && !empty && (
        <div className={styles.detail}>{playerDetail(player)}</div>
      )}
    </div>
  )
  return align === 'left' ? (
    <>
      {info}
      {points}
    </>
  ) : (
    <>
      {points}
      {info}
    </>
  )
}

const Row: React.FC<{
  row: MatchupRow
  highlighted: boolean
  first: boolean
}> = ({ row, highlighted, first }) => {
  const ref = useScrollIntoView(highlighted, first)
  const mine = row.mine?.points ?? 0
  const theirs = row.theirs?.points ?? 0
  return (
    <div ref={ref} className={styles.row} data-highlighted={highlighted}>
      <Side player={row.mine} ahead={mine > theirs} align="left" />
      <div className={styles.slot}>{row.slot}</div>
      <Side player={row.theirs} ahead={theirs > mine} align="right" />
    </div>
  )
}

const BenchToggle: React.FC<{
  open: boolean
  highlighted: boolean
  onToggle: () => void
}> = ({ open, highlighted, onToggle }) => {
  const ref = useScrollIntoView(highlighted, false)
  return (
    <div
      ref={ref}
      className={styles.toggle}
      data-highlighted={highlighted}
      onClick={onToggle}
    >
      <span className="material-icons">
        {open ? 'expand_less' : 'expand_more'}
      </span>
      {open ? 'Hide bench' : 'Show bench'}
    </div>
  )
}

const Fantasy: React.FC<{ active: boolean }> = ({ active }) => {
  const feed = useFeed<FantasyView>('fantasy', active)
  const [benchOpen, setBenchOpen] = useState(false)
  const view = feed.items[0] ?? null
  const matchup = view?.kind === 'matchup' ? view : null

  const starters = useMemo(
    () => (matchup ? starterRows(matchup.me, matchup.opponent) : []),
    [matchup]
  )
  const bench = useMemo(
    () => (matchup ? benchRows(matchup.me, matchup.opponent) : []),
    [matchup]
  )

  // Dial order: starters, then the bench toggle, then the open bench.
  const toggleIndex = starters.length
  const count = matchup
    ? starters.length + 1 + (benchOpen ? bench.length : 0)
    : 0
  // No rows before a matchup loads, so the highlight starts on the first
  // starter instead of following the toggle down the list.
  const keys = useMemo(
    () =>
      matchup
        ? [
            ...starters.map(r => r.key),
            'toggle',
            ...(benchOpen ? bench.map(r => r.key) : [])
          ]
        : [],
    [matchup, starters, bench, benchOpen]
  )
  const highlighted = useListNav(
    count,
    active,
    i => {
      if (i === toggleIndex) setBenchOpen(o => !o)
    },
    keys
  )
  const isHighlighted = (i: number) => active && i === highlighted

  const lead = matchup ? leader(matchup.me, matchup.opponent) : 'tied'

  return (
    <div className={tabStyles.tab} data-scroll-container>
      <StaleBadge stale={feed.stale} label={feed.fetchedAtLabel} />

      {feed.loaded && !view && (
        // The host says what to do, e.g. "Enter your Sleeper username".
        <div className={tabStyles.empty}>
          {feed.error ?? 'No fantasy matchup'}
        </div>
      )}

      {view && (
        <div className={tabStyles.heading}>
          {[
            view.leagueName,
            view.week !== undefined ? `Week ${view.week}` : null
          ]
            .filter(Boolean)
            .join(' · ') || 'Fantasy'}
        </div>
      )}

      {view?.kind === 'none' && (
        <div className={styles.notice}>
          <span className="material-icons">sports_football</span>
          <div>{view.message}</div>
        </div>
      )}

      {matchup && (
        <>
          <div className={styles.card}>
            <div className={styles.team} data-align="left">
              <div className={styles.teamName}>{matchup.me.name}</div>
              <div className={styles.total} data-ahead={lead === 'me'}>
                {formatPoints(matchup.me.points)}
              </div>
            </div>
            <div className={styles.vs}>vs</div>
            <div className={styles.team} data-align="right">
              <div className={styles.teamName}>{matchup.opponent.name}</div>
              <div
                className={styles.total}
                data-ahead={lead === 'opponent'}
              >
                {formatPoints(matchup.opponent.points)}
              </div>
            </div>
          </div>

          {starters.map((row, i) => (
            <Row
              key={row.key}
              row={row}
              highlighted={isHighlighted(i)}
              first={i === 0}
            />
          ))}

          <BenchToggle
            open={benchOpen}
            highlighted={isHighlighted(toggleIndex)}
            onToggle={() => setBenchOpen(o => !o)}
          />

          {benchOpen &&
            bench.map((row, i) => (
              <Row
                key={row.key}
                row={row}
                highlighted={isHighlighted(toggleIndex + 1 + i)}
                first={false}
              />
            ))}
          {benchOpen && bench.length === 0 && (
            <div className={styles.benchEmpty}>No bench players</div>
          )}
          {/* Room for the page dots under the last row. */}
          <div className={styles.end} />
        </>
      )}
    </div>
  )
}

export default Fantasy
