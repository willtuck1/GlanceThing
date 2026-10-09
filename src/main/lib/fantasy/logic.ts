import { FantasyPlayer, FantasyTeam, FantasyView, Game } from '../feeds/types.js'
import { LIVE_INTERVAL, sportsInterval } from '../sports/logic.js'
import {
  parseScoring,
  projectedPoints,
  ProjectionMap,
  Projections,
  Scoring
} from './projections.js'

export const FANTASY_LIVE_INTERVAL = LIVE_INTERVAL
export const FANTASY_IDLE_INTERVAL = 10 * 60 * 1000
// The full player list is ~15 MB, so it is downloaded at most once a day.
export const PLAYERS_MAX_AGE = 24 * 60 * 60 * 1000

// Lineup slots that are not starters.
const NON_STARTER_SLOTS = new Set(['BN', 'IR', 'TAXI', 'RES'])

const SLOT_LABELS: Record<string, string> = {
  SUPER_FLEX: 'SF',
  WRRB_FLEX: 'W/R',
  REC_FLEX: 'W/T',
  WRRB_WRT: 'W/R/T',
  IDP_FLEX: 'IDP'
}

// Sleeper marks an empty starter slot with this player id.
export const EMPTY_SLOT = '0'

export interface PlayerInfo {
  name: string
  position: string
  team?: string
  out?: FantasyPlayer['out']
}

// Sleeper injury_status values that mean the player won't play.
const OUT_STATUSES = new Set(['Out', 'IR', 'PUP', 'Sus', 'NA', 'DNR'])

// 'OUT' from the injury report, 'Inactive' from the roster status.
export function availability(
  injuryStatus: unknown,
  status: unknown
): FantasyPlayer['out'] | undefined {
  if (typeof injuryStatus === 'string' && OUT_STATUSES.has(injuryStatus))
    return 'OUT'
  if (status === 'Inactive') return 'Inactive'
  return undefined
}

export type PlayerMap = Record<string, PlayerInfo>

// Sleeper's responses are read as unknown and checked field by field, so a
// missing or renamed field drops a value instead of crashing the feed.

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function ids(value: unknown): string[] {
  return list(value).filter((v): v is string => typeof v === 'string')
}

// Rounds to Sleeper's two decimals so float noise never reaches the screen.
function round(n: number) {
  return Math.round(n * 100) / 100
}

export function slotLabel(position: string) {
  return SLOT_LABELS[position] ?? position
}

// The league's starter slots, in the order of a matchup's `starters`.
export function starterSlots(rosterPositions: unknown): string[] {
  return ids(rosterPositions).filter(p => !NON_STARTER_SLOTS.has(p))
}

// Keeps only the fields the tab needs from GET /players/nfl.
export function slimPlayers(json: unknown): PlayerMap {
  const raw = obj(json)
  const out: PlayerMap = {}
  if (!raw) return out

  for (const [id, value] of Object.entries(raw)) {
    const p = obj(value)
    if (!p) continue
    const first = text(p.first_name)
    const last = text(p.last_name)
    const name =
      text(p.full_name) ??
      ([first, last].filter(Boolean).join(' ') || null) ??
      id
    const position = text(p.position) ?? ''
    const info: PlayerInfo = { name, position }
    const team = text(p.team)
    if (team) info.team = team
    const unavailable = availability(p.injury_status, p.status)
    if (unavailable) info.out = unavailable
    out[id] = info
  }

  return out
}

export function playersFresh(fetchedAt: number | null, now: number) {
  return fetchedAt !== null && now - fetchedAt < PLAYERS_MAX_AGE
}

// Roster id → team name: the owner's team_name, else their display_name.
export function teamNames(rosters: unknown, users: unknown) {
  const byUser = new Map<string, string>()
  for (const value of list(users)) {
    const u = obj(value)
    const id = text(u?.user_id)
    if (!u || !id) continue
    const name =
      text(obj(u.metadata)?.team_name) ??
      text(u.display_name) ??
      text(u.username)
    if (name) byUser.set(id, name)
  }

  const names = new Map<number, string>()
  for (const value of list(rosters)) {
    const r = obj(value)
    const rosterId = num(r?.roster_id)
    if (!r || rosterId === null) continue
    const owner = text(r.owner_id)
    names.set(rosterId, (owner && byUser.get(owner)) ?? `Team ${rosterId}`)
  }

  return names
}

// The roster the user owns or co-owns in this league.
export function findMyRoster(rosters: unknown, userId: string) {
  for (const value of list(rosters)) {
    const r = obj(value)
    const rosterId = num(r?.roster_id)
    if (!r || rosterId === null) continue
    if (r.owner_id === userId || ids(r.co_owners).includes(userId))
      return r
  }
  return null
}

export interface MatchupEntry {
  rosterId: number
  matchupId: number | null
  points: number | null
  customPoints: number | null
  starters: string[]
  players: string[]
  startersPoints: number[]
  playersPoints: Record<string, number>
}

export function parseMatchups(json: unknown): MatchupEntry[] {
  const out: MatchupEntry[] = []
  for (const value of list(json)) {
    const m = obj(value)
    const rosterId = num(m?.roster_id)
    if (!m || rosterId === null) continue

    const playersPoints: Record<string, number> = {}
    for (const [id, pts] of Object.entries(obj(m.players_points) ?? {})) {
      const n = num(pts)
      if (n !== null) playersPoints[id] = n
    }

    out.push({
      rosterId,
      matchupId: num(m.matchup_id),
      points: num(m.points),
      customPoints: num(m.custom_points),
      starters: ids(m.starters),
      players: ids(m.players),
      startersPoints: list(m.starters_points).map(v => num(v) ?? 0),
      playersPoints
    })
  }
  return out
}

// My entry and my opponent's: the other entry with the same matchup_id.
// Null when I have no matchup this week (bye, eliminated, median-only).
export function pairMatchup(entries: MatchupEntry[], myRosterId: number) {
  const me = entries.find(e => e.rosterId === myRosterId)
  if (!me || me.matchupId === null) return null
  const opponent = entries.find(
    e => e.matchupId === me.matchupId && e.rosterId !== myRosterId
  )
  if (!opponent) return null
  return { me, opponent }
}

function playerPoints(entry: MatchupEntry, id: string, index?: number) {
  const pts =
    entry.playersPoints[id] ??
    (index !== undefined ? entry.startersPoints[index] : undefined)
  return round(pts ?? 0)
}

// The team's total: the commissioner's override, else Sleeper's own total,
// else the sum of the starters.
export function teamTotal(entry: MatchupEntry) {
  if (entry.customPoints !== null) return round(entry.customPoints)
  if (entry.points !== null) return round(entry.points)
  return round(
    entry.starters.reduce(
      (sum, id, i) => (id === EMPTY_SLOT ? sum : sum + playerPoints(entry, id, i)),
      0
    )
  )
}

// What a player row needs besides the matchup: names and projections.
export interface PlayerContext {
  players: PlayerMap
  projections: ProjectionMap | null
  scoring: Scoring | null
}

function toPlayer(
  id: string,
  slot: string,
  points: number,
  ctx: PlayerContext
): FantasyPlayer {
  if (id === EMPTY_SLOT)
    return { id: `${EMPTY_SLOT}:${slot}`, name: 'Empty', position: '', slot, points: 0 }
  const info = ctx.players[id]
  const p: FantasyPlayer = {
    id,
    name: info?.name ?? id,
    position: info?.position ?? '',
    slot,
    points
  }
  if (info?.team) p.team = info.team
  if (info?.out) p.out = info.out
  const projected = ctx.projections
    ? projectedPoints(ctx.projections[id], ctx.scoring)
    : null
  if (projected !== null) p.projected = projected
  return p
}

// Starters labelled with their slot, in lineup order.
export function mapStarters(
  entry: MatchupEntry,
  slots: string[],
  ctx: PlayerContext
): FantasyPlayer[] {
  return entry.starters.map((id, i) => {
    const slot = slotLabel(slots[i] ?? 'FLEX')
    const points = id === EMPTY_SLOT ? 0 : playerPoints(entry, id, i)
    return toPlayer(id, slot, points, ctx)
  })
}

// Bench: everyone in the matchup who isn't starting and isn't on IR or the
// taxi squad, highest scorers first, then by name.
export function mapBench(
  entry: MatchupEntry,
  ctx: PlayerContext,
  excluded: string[] = []
): FantasyPlayer[] {
  const skip = new Set([...entry.starters, ...excluded, EMPTY_SLOT])
  return sortByPoints(
    entry.players
      .filter(id => !skip.has(id))
      .map(id => toPlayer(id, 'BN', playerPoints(entry, id), ctx))
  )
}

export function sortByPoints(list: FantasyPlayer[]) {
  return [...list].sort(
    (a, b) => b.points - a.points || a.name.localeCompare(b.name)
  )
}

function rosterExtras(rosters: unknown, rosterId: number) {
  for (const value of list(rosters)) {
    const r = obj(value)
    if (num(r?.roster_id) === rosterId)
      return [...ids(r?.reserve), ...ids(r?.taxi)]
  }
  return []
}

export interface ViewInput {
  userId: string
  league: unknown
  rosters: unknown
  users: unknown
  matchups: unknown
  players: PlayerMap
  // Null when Sleeper's projections are unavailable.
  projections?: Projections | null
  week: number
}

export const NO_MATCHUP =
  'No matchup this week. It may be a bye week, or your season is over.'
export const NOT_IN_LEAGUE = "You don't have a team in this league."

export function buildView(input: ViewInput): FantasyView {
  const league = obj(input.league)
  const leagueName = text(league?.name) ?? 'Sleeper league'
  const week = input.week

  const mine = findMyRoster(input.rosters, input.userId)
  const myRosterId = num(mine?.roster_id)
  if (myRosterId === null)
    return { kind: 'none', leagueName, week, message: NOT_IN_LEAGUE }

  const pair = pairMatchup(parseMatchups(input.matchups), myRosterId)
  if (!pair) return { kind: 'none', leagueName, week, message: NO_MATCHUP }

  const slots = starterSlots(league?.roster_positions)
  const names = teamNames(input.rosters, input.users)
  const projections = input.projections ?? null
  const ctx: PlayerContext = {
    players: input.players,
    projections: projections?.players ?? null,
    scoring: parseScoring(league)
  }
  const hasProjections =
    projections !== null && Object.keys(projections.players).length > 0

  const team = (entry: MatchupEntry): FantasyTeam => ({
    rosterId: entry.rosterId,
    name: names.get(entry.rosterId) ?? `Team ${entry.rosterId}`,
    points: teamTotal(entry),
    starters: mapStarters(entry, slots, ctx),
    bench: mapBench(
      entry,
      ctx,
      rosterExtras(input.rosters, entry.rosterId)
    )
  })

  return {
    kind: 'matchup',
    leagueName,
    week,
    projections: hasProjections,
    ...(hasProjections && projections
      ? { playingTeams: projections.teams }
      : {}),
    me: team(pair.me),
    opponent: team(pair.opponent)
  }
}

export interface NflState {
  season: string
  week: number
  seasonType: string
}

export function parseState(json: unknown): NflState | null {
  const s = obj(json)
  const season = text(s?.season) ?? text(s?.league_season)
  const week = num(s?.week) ?? num(s?.display_week)
  if (!season || week === null) return null
  return { season, week, seasonType: text(s?.season_type) ?? 'regular' }
}

export const OFFSEASON =
  'It is the NFL offseason. Your matchup shows here once the season starts.'

// A friendly reason there's no matchup before even asking the league, or
// null when the league should be checked.
export function seasonNotice(state: NflState): string | null {
  if (state.seasonType === 'off' || state.seasonType === 'pre')
    return OFFSEASON
  if (state.week < 1) return OFFSEASON
  return null
}

export function leagueNotice(league: unknown): string | null {
  const status = text(obj(league)?.status)
  if (status === 'pre_draft' || status === 'drafting')
    return 'Your league has not finished its draft yet.'
  if (status === 'complete') return 'Your league season is over.'
  return null
}

export interface LeagueOption {
  id: string
  name: string
}

export function parseLeagues(json: unknown): LeagueOption[] {
  const out: LeagueOption[] = []
  for (const value of list(json)) {
    const l = obj(value)
    const id = text(l?.league_id)
    if (!l || !id) continue
    out.push({ id, name: text(l.name) ?? 'Unnamed league' })
  }
  return out
}

// The saved league if the user is still in it, else their first league.
export function pickLeague(leagues: LeagueOption[], savedId: string | null) {
  return leagues.find(l => l.id === savedId) ?? leagues[0] ?? null
}

// Polls fast while any NFL game is live or about to start, using the same
// rule as the Sports tab.
export function fantasyInterval(games: Game[], now: number) {
  const nfl = games.filter(g => g.league === 'nfl')
  return sportsInterval(nfl, now) === LIVE_INTERVAL
    ? FANTASY_LIVE_INTERVAL
    : FANTASY_IDLE_INTERVAL
}
