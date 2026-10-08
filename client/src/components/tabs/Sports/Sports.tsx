import { useFeed } from '@/hooks/useFeed.ts'
import { useListNav } from '@/hooks/useListNav.ts'

import ListRow from '@/components/ListRow/ListRow.tsx'
import StaleBadge from '@/components/StaleBadge/StaleBadge.tsx'

import type { Game } from '@/types/Feeds.ts'

import styles from '../tab.module.css'

function scoreLine(game: Game) {
  if (game.state === 'pre') return 'vs'
  return `${game.away.score ?? 0} - ${game.home.score ?? 0}`
}

const Sports: React.FC<{ active: boolean }> = ({ active }) => {
  const feed = useFeed<Game>('sports', active)
  const highlighted = useListNav(feed.items.length, active)

  return (
    <div className={styles.tab} data-scroll-container>
      <StaleBadge stale={feed.stale} label={feed.fetchedAtLabel} />
      {feed.loaded && feed.items.length === 0 && (
        <div className={styles.empty}>No games today</div>
      )}
      {feed.items.map((game, i) => (
        <ListRow
          key={game.id}
          title={`${game.away.abbr} ${scoreLine(game)} ${game.home.abbr}`}
          subtitle={`${game.league.toUpperCase()} · ${game.detail}`}
          highlighted={active && i === highlighted}
        />
      ))}
    </div>
  )
}

export default Sports
