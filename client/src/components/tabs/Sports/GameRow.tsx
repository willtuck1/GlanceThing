import { useEffect, useRef } from 'react'

import { useLongPress } from '@/hooks/useLongPress.ts'
import { scrollRowIntoView } from '@/components/ListRow/scrollRowIntoView.ts'
import { splitTint } from '@/lib/tint.ts'

import type { Game, Team } from '@/types/Feeds.ts'

import styles from './GameRow.module.css'

interface GameRowProps {
  game: Game
  favorites: string[]
  highlighted: boolean
  onToggleTeam: (teamKey: string) => void
  onToggleGame: (game: Game) => void
}

const TeamButton: React.FC<{
  team: Team
  favorite: boolean
  side: 'away' | 'home'
  onToggle: (key: string) => void
}> = ({ team, favorite, side, onToggle }) => (
  <div
    className={styles.team}
    data-side={side}
    data-favorite={favorite}
    onClick={() => onToggle(team.key)}
  >
    {/* Material icon, not a ★ glyph: the device font may not have one. */}
    <span className={`material-icons ${styles.star}`}>
      {favorite ? 'star' : 'star_border'}
    </span>
    <span className={styles.abbr}>{team.abbr}</span>
  </div>
)

const LEAGUE_ICON: Record<Game['league'], string> = {
  nba: 'sports_basketball',
  nfl: 'sports_football'
}

// Where the two team colors meet: the middle of the score, from the row's
// left edge. Row padding 16 + badge 52 + 12 margin + team 116 + half the
// 170 px score. Keep in sync with GameRow.module.css.
const SPLIT_AT = '281px'

function scoreText(game: Game) {
  if (game.state === 'pre') return null
  return [game.away.score ?? 0, game.home.score ?? 0]
}

const GameRow: React.FC<GameRowProps> = ({
  game,
  favorites,
  highlighted,
  onToggleTeam,
  onToggleGame
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const longPress = useLongPress(() => onToggleGame(game))
  const scores = scoreText(game)

  useEffect(() => {
    if (highlighted && ref.current) scrollRowIntoView(ref.current)
  }, [highlighted])

  return (
    <div
      ref={ref}
      className={styles.row}
      data-highlighted={highlighted}
      data-stale={!!game.stale}
      data-state={game.state}
      // Away team sits on the left, home on the right; so do their colors.
      style={{
        backgroundImage: splitTint(
          game.away.color,
          game.home.color,
          SPLIT_AT
        )
      }}
      {...longPress}
    >
      <div className={styles.chip} data-league={game.league}>
        <span className="material-icons">{LEAGUE_ICON[game.league]}</span>
        <span className={styles.league}>{game.league.toUpperCase()}</span>
      </div>
      <TeamButton
        team={game.away}
        side="away"
        favorite={favorites.includes(game.away.key)}
        onToggle={onToggleTeam}
      />
      <div className={styles.score}>
        {scores ? (
          <>
            <span>{scores[0]}</span>
            <span className={styles.dash}>-</span>
            <span>{scores[1]}</span>
          </>
        ) : (
          <span className={styles.at}>@</span>
        )}
      </div>
      <TeamButton
        team={game.home}
        side="home"
        favorite={favorites.includes(game.home.key)}
        onToggle={onToggleTeam}
      />
      <div className={styles.detail}>
        {game.state === 'in' && <span className={styles.live} />}
        {game.detail}
        {game.stale && (
          <span className={`material-icons ${styles.staleIcon}`}>
            sync_problem
          </span>
        )}
      </div>
    </div>
  )
}

export default GameRow
