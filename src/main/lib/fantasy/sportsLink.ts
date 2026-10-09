import { FantasyView, FeedPayload, Game } from '../feeds/types.js'

// How the Fantasy feed follows the Sports feed. Kept apart from
// setup/feeds.ts so it can be tested without Electron.

interface PayloadSource {
  getPayload(): FeedPayload<unknown>
}

// The Sports feed's games for the Fantasy tab's game status. Reads the
// feed's own payload, not the one sent to the Sports tab: that one is cut to
// a 12-hour window and its pre-game details are rewritten. Null before the
// Sports feed exists.
export function sportsSnapshot(feed: PayloadSource | null) {
  const payload = feed?.getPayload()
  return payload
    ? { items: payload.items as Game[], stale: payload.stale }
    : null
}

export interface FollowDeps {
  // The Fantasy payload as clients see it (decorated), or null.
  getFantasyPayload: () => FeedPayload<FantasyView> | null
  broadcast: (type: string, payload: unknown) => void
}

// Called after any feed publishes. A Sports update re-sends the Fantasy
// payload, so game status follows the Sports feed's 30-second live cadence.
// Nothing is sent before the Fantasy feed has data, so the tab never
// flashes empty at startup.
export function afterPublish(key: string, deps: FollowDeps) {
  if (key !== 'sports') return
  const payload = deps.getFantasyPayload()
  if (payload && payload.items.length > 0)
    deps.broadcast('fantasy', payload)
}
