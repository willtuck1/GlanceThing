import { describe, expect, it, vi } from 'vitest'

import { afterPublish, sportsSnapshot } from './sportsLink.js'
import { decoratePayload, registerFeed, unregisterAll } from '../feeds/registry.js'
import { Feed } from '../feeds/Feed.js'

import { FantasyView, FeedPayload, Game } from '../feeds/types.js'

function payload<T>(items: T[], stale = false): FeedPayload<T> {
  return { items, fetchedAt: 1, fetchedAtLabel: '', stale, error: null }
}

const game = {
  id: 'nfl:1',
  league: 'nfl',
  week: 5,
  state: 'pre',
  detail: '10/11 - 1:00 PM EDT',
  start: 0
} as unknown as Game

const view: FantasyView = { kind: 'none', message: 'x' }

describe('sportsSnapshot', () => {
  it("reads the Sports feed's own games, not the decorated ones", () => {
    // A Feed whose sports decorator drops every game, like the 12-hour
    // window does for games days away.
    const feed = new Feed<unknown>(
      { key: 'sports', fetch: async () => [game], interval: () => 30_000 },
      {
        now: () => 0,
        formatTime: () => '',
        loadCache: () => ({ items: [game], fetchedAt: 0 }),
        saveCache: () => {},
        publish: () => {}
      }
    )
    registerFeed('sports', feed, p => ({ ...p, items: [] }))
    try {
      expect(
        (decoratePayload('sports', feed.getPayload()) as FeedPayload<Game>)
          .items
      ).toEqual([])
      expect(sportsSnapshot(feed)).toEqual({ items: [game], stale: false })
    } finally {
      unregisterAll()
    }
  })

  it('passes the stale flag through and is null without a feed', () => {
    expect(
      sportsSnapshot({ getPayload: () => payload([game], true) })?.stale
    ).toBe(true)
    expect(sportsSnapshot(null)).toBeNull()
  })
})

describe('afterPublish', () => {
  it('re-sends the Fantasy payload on every Sports publish', () => {
    const broadcast = vi.fn()
    const fantasy = payload([view])
    const deps = { getFantasyPayload: () => fantasy, broadcast }
    afterPublish('sports', deps)
    afterPublish('sports', deps)
    expect(broadcast).toHaveBeenCalledTimes(2)
    expect(broadcast).toHaveBeenCalledWith('fantasy', fantasy)
  })

  it('ignores other feeds', () => {
    const broadcast = vi.fn()
    for (const key of ['fantasy', 'calendar', 'todo'])
      afterPublish(key, {
        getFantasyPayload: () => payload([view]),
        broadcast
      })
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('sends nothing before the Fantasy feed has data', () => {
    const broadcast = vi.fn()
    afterPublish('sports', { getFantasyPayload: () => null, broadcast })
    afterPublish('sports', {
      getFantasyPayload: () => payload<FantasyView>([]),
      broadcast
    })
    expect(broadcast).not.toHaveBeenCalled()
  })
})
