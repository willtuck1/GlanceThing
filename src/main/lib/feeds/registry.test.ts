import { afterEach, describe, expect, it } from 'vitest'

import { Feed } from './Feed.js'
import {
  decoratePayload,
  getFeedPayload,
  registerFeed,
  unregisterAll
} from './registry.js'

function feed(items: number[]) {
  return new Feed<unknown>(
    { key: 'sports', fetch: async () => items, interval: () => 60_000 },
    {
      now: () => 0,
      formatTime: () => '',
      loadCache: () => ({ items, fetchedAt: 0 }),
      saveCache: () => {},
      publish: () => {}
    }
  )
}

describe('feed registry', () => {
  afterEach(() => unregisterAll())

  it('returns null for a feed that is not running', () => {
    expect(getFeedPayload('sports')).toBeNull()
  })

  it('returns the plain payload without a decorator', () => {
    registerFeed('todo', feed([1, 2]))
    expect(getFeedPayload('todo')).toMatchObject({ items: [1, 2] })
  })

  it('applies the decorator to served and published payloads', () => {
    registerFeed('sports', feed([3, 1, 2]), p => ({
      ...p,
      items: [...(p.items as number[])].sort(),
      extra: true
    }))
    expect(getFeedPayload('sports')).toMatchObject({
      items: [1, 2, 3],
      extra: true
    })
    const published = decoratePayload('sports', {
      items: [9, 8],
      fetchedAt: 1,
      fetchedAtLabel: '',
      stale: false,
      error: null
    })
    expect(published).toMatchObject({ items: [8, 9], extra: true })
  })

  it('drops decorators on unregister', () => {
    registerFeed('sports', feed([2, 1]), p => ({ ...p, extra: true }))
    unregisterAll()
    registerFeed('sports', feed([2, 1]))
    expect(getFeedPayload('sports')).not.toHaveProperty('extra')
  })
})
