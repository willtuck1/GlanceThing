// Pure selection of the sleep-clock widgets from the feed payloads.
import type { FeedPayload } from '@/types/Feeds.ts'
import type { WeatherView } from '@/modules/weather/types.ts'
import type { CalendarEvent } from '@/modules/calendar/types.ts'
import type { Task } from '@/modules/todo/types.ts'
import type { SportsPayload } from '@/modules/sports/types.ts'
import type { FantasyView } from '@/modules/fantasy/types.ts'

export interface Widget {
  id: string
  line1: string
  line2: string
}

type Line = { line1: string; line2: string } | null

const weather = (items: WeatherView[]): Line => {
  const v = items[0]
  if (!v || v.kind !== 'forecast') return null
  return { line1: v.current.tempLabel, line2: v.current.label }
}

const calendar = (items: CalendarEvent[], now: number): Line => {
  const e = items.find(
    ev => typeof ev.endMs === 'number' && ev.endMs > now
  )
  if (!e) return null
  return {
    line1: e.title,
    line2: e.allDay ? e.dayLabel : `${e.dayLabel} ${e.startLabel}`.trim()
  }
}

const todo = (items: Task[]): Line => {
  const n = items.filter(t => !t.done).length
  return n > 0 ? { line1: `${n} open`, line2: 'To-do' } : null
}

const sports = (payload: SportsPayload): Line => {
  const favs = payload.favorites ?? []
  const g = payload.items.find(
    x =>
      x.state === 'in' &&
      !x.stale &&
      (favs.includes(x.home.key) || favs.includes(x.away.key))
  )
  if (!g) return null
  return {
    line1: `${g.away.abbr} ${g.away.score ?? 0} - ${g.home.score ?? 0} ${g.home.abbr}`,
    line2: g.detail
  }
}

const fantasy = (items: FantasyView[]): Line => {
  const v = items[0]
  if (!v || v.kind !== 'matchup') return null
  return {
    line1: `${v.me.points} - ${v.opponent.points}`,
    line2: `${v.me.name} vs ${v.opponent.name}`
  }
}

export function selectWidgets(
  ids: string[],
  feeds: Record<string, FeedPayload<unknown> | null>,
  hostNow: number
): Widget[] {
  const out: Widget[] = []
  for (const id of ids) {
    const p = feeds[id]
    if (!p || p.stale || p.error || !Array.isArray(p.items)) continue
    if (p.items.length === 0) continue
    let line: Line = null
    switch (id) {
      case 'weather':
        line = weather(p.items as WeatherView[])
        break
      case 'calendar':
        line = calendar(p.items as CalendarEvent[], hostNow)
        break
      case 'todo':
        line = todo(p.items as Task[])
        break
      case 'sports':
        line = sports(p as SportsPayload)
        break
      case 'fantasy':
        line = fantasy(p.items as FantasyView[])
        break
    }
    if (line) out.push({ id, ...line })
  }
  return out
}

const OFFSETS: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 12, y: -8 },
  { x: -12, y: 8 },
  { x: 12, y: 8 },
  { x: -12, y: -8 },
  { x: 0, y: 8 },
  { x: -12, y: 0 },
  { x: 12, y: 0 }
]

export const burnInOffset = (n: number): { x: number; y: number } =>
  OFFSETS[((Math.floor(n) % 8) + 8) % 8]
