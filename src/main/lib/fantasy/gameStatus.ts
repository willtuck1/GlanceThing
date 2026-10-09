import {
  FantasyGameStatus,
  FantasyPlayer,
  FantasyTeam,
  FantasyView,
  FeedPayload,
  Game
} from '../feeds/types.js'

// Sleeper team abbreviation → ESPN's. Checked against Sleeper's player and
// projection data and ESPN's NFL scoreboard on 2026-10-09: the only current
// difference is Washington (WAS / WSH). JAC and LA are older Sleeper codes
// for the Jaguars and Rams. A team missing here gets no game status.
export const SLEEPER_TO_ESPN: Record<string, string> = {
  ARI: 'ARI',
  ATL: 'ATL',
  BAL: 'BAL',
  BUF: 'BUF',
  CAR: 'CAR',
  CHI: 'CHI',
  CIN: 'CIN',
  CLE: 'CLE',
  DAL: 'DAL',
  DEN: 'DEN',
  DET: 'DET',
  GB: 'GB',
  HOU: 'HOU',
  IND: 'IND',
  JAX: 'JAX',
  JAC: 'JAX',
  KC: 'KC',
  LAC: 'LAC',
  LAR: 'LAR',
  LA: 'LAR',
  LV: 'LV',
  MIA: 'MIA',
  MIN: 'MIN',
  NE: 'NE',
  NO: 'NO',
  NYG: 'NYG',
  NYJ: 'NYJ',
  PHI: 'PHI',
  PIT: 'PIT',
  SEA: 'SEA',
  SF: 'SF',
  TB: 'TB',
  TEN: 'TEN',
  WAS: 'WSH'
}

export function espnTeam(sleeperTeam: string | undefined) {
  return sleeperTeam ? (SLEEPER_TO_ESPN[sleeperTeam] ?? null) : null
}

// A regulation NFL game: four 15-minute quarters.
const QUARTER_SECONDS = 15 * 60
const GAME_SECONDS = 4 * QUARTER_SECONDS

// This week's NFL games by ESPN team abbreviation, or null when game status
// can't be trusted: ESPN is down or stale, or its scoreboard shows a
// different week than Sleeper (ESPN moves on to next week before Sleeper
// does). Games from a failed refresh are left out.
export function weekGames(
  games: Game[],
  week: number
): Map<string, Game> | null {
  const byTeam = new Map<string, Game>()
  for (const g of games) {
    if (g.league !== 'nfl' || g.stale || g.week !== week) continue
    byTeam.set(g.home.abbr, g)
    byTeam.set(g.away.abbr, g)
  }
  return byTeam.size > 0 ? byTeam : null
}

// Share of a game still to play, from 1 before kickoff to 0 at the end of
// the 4th quarter: ((4 − quarter) × 15 min + clock) / 60 min. Overtime
// counts as 0 remaining.
export function fractionRemaining(period: number, clockSeconds: number) {
  if (period < 1) return 1
  if (period > 4) return 0
  const clock = Math.min(Math.max(clockSeconds, 0), QUARTER_SECONDS)
  return ((4 - period) * QUARTER_SECONDS + clock) / GAME_SECONDS
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// 'Sun 1:00 PM', in the host's local time and time format.
export function kickoffLabel(start: number, formatTime: (ts: number) => string) {
  return `${WEEKDAYS[new Date(start).getDay()]} ${formatTime(start)}`
}

function clockLabel(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// 'Q3 4:12', 'OT 2:01' or 'Half'. ESPN's own text when the quarter or
// clock is missing.
export function liveLabel(game: Game) {
  if (/^half/i.test(game.detail)) return 'Half'
  if (game.period === undefined || game.clock === undefined)
    return game.detail || 'Live'
  const quarter = game.period > 4 ? 'OT' : `Q${game.period}`
  return `${quarter} ${clockLabel(game.clock)}`
}

// Sleeper's OUT/Inactive comes from its player list, downloaded once a
// day, so it can be stale by game time. It counts before kickoff, and once
// the game is on only while the player still has no points.
export function honoursOut(player: FantasyPlayer, game?: Game) {
  if (!player.out) return false
  return !game || game.state === 'pre' || player.points === 0
}

// ESPN abbreviations of the teams that play this week, from Sleeper's
// projections. Null when projections are unavailable.
export function playingSet(teams: string[] | undefined) {
  if (!teams) return null
  const set = new Set<string>()
  for (const t of teams) {
    const espn = espnTeam(t)
    if (espn) set.add(espn)
  }
  return set
}

// The status shown on a player's row. Undefined when unknown: no team,
// an unmapped team, no trustworthy scoreboard, or a team missing from
// ESPN that Sleeper doesn't list as on bye.
export function playerGameStatus(
  player: FantasyPlayer,
  games: Map<string, Game> | null,
  formatTime: (ts: number) => string,
  playing: Set<string> | null = null
): FantasyGameStatus | undefined {
  const team = espnTeam(player.team)
  const game = team && games ? games.get(team) : undefined
  if (player.out && honoursOut(player, game))
    return { state: 'out', label: player.out }
  if (!team || !games) return undefined
  if (!game)
    // ESPN can drop an unreadable event, so a missing game alone isn't a
    // bye: Sleeper's projections must also show the team without an
    // opponent.
    return playing && !playing.has(team)
      ? { state: 'bye', label: 'Bye' }
      : undefined
  if (game.state === 'pre')
    return { state: 'pre', label: kickoffLabel(game.start, formatTime) }
  if (game.state === 'post') return { state: 'post', label: 'Final' }
  return { state: 'in', label: liveLabel(game) }
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

// One starter's share of the estimated final score:
// - game final, bye, out (see honoursOut) or unknown: actual points
// - game not started: projected points (actual if there's no projection)
// - game live: actual + projected × fraction of the game remaining, where
//   the fraction is ((4 − quarter) × 15 min + clock) / 60 min and overtime
//   counts as 0
export function playerEstimate(player: FantasyPlayer, game?: Game) {
  const actual = player.points
  const projected = player.projected
  if (!game || projected === undefined) return actual
  if (honoursOut(player, game)) return actual
  if (game.state === 'pre') return projected
  if (game.state === 'post') return actual
  if (game.period === undefined || game.clock === undefined) return actual
  return actual + projected * fractionRemaining(game.period, game.clock)
}

// Estimated final score: the sum of every starter's estimate (empty slots
// add nothing).
export function teamEstimate(
  starters: FantasyPlayer[],
  games: Map<string, Game>
) {
  let total = 0
  for (const p of starters) {
    if (p.position === '') continue
    const team = espnTeam(p.team)
    total += playerEstimate(p, team ? games.get(team) : undefined)
  }
  return round(total)
}

export interface DecorateFantasyOptions {
  formatTime: (ts: number) => string
}

function decorateTeam(
  team: FantasyTeam,
  games: Map<string, Game> | null,
  playing: Set<string> | null,
  withEstimate: boolean,
  { formatTime }: DecorateFantasyOptions
): FantasyTeam {
  const add = (p: FantasyPlayer): FantasyPlayer => {
    const clean = { ...p }
    delete clean.game
    const game = playerGameStatus(clean, games, formatTime, playing)
    return game ? { ...clean, game } : clean
  }
  const out: FantasyTeam = {
    ...team,
    starters: team.starters.map(add),
    bench: team.bench.map(add)
  }
  delete out.estimate
  if (games && withEstimate) out.estimate = teamEstimate(team.starters, games)
  return out
}

// Adds each player's game status and each team's estimated final score to
// the fantasy payload, from the Sports feed's NFL games. When ESPN is down
// (`games` stale or failed), points and projections still show without game
// status or estimate.
export function decorateFantasy(
  payload: FeedPayload<FantasyView>,
  sports: { items: Game[]; stale: boolean } | null,
  options: DecorateFantasyOptions
): FeedPayload<FantasyView> {
  return {
    ...payload,
    items: payload.items.map(view => {
      if (view.kind !== 'matchup') return view
      const games =
        sports && !sports.stale ? weekGames(sports.items, view.week) : null
      const withEstimate = view.projections === true
      const playing = playingSet(view.playingTeams)
      const out = {
        ...view,
        me: decorateTeam(view.me, games, playing, withEstimate, options),
        opponent: decorateTeam(
          view.opponent,
          games,
          playing,
          withEstimate,
          options
        )
      }
      delete out.playingTeams
      return out
    })
  }
}
