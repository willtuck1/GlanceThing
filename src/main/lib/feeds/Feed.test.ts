import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Feed, FeedDeps, REFRESH_RATE_LIMIT_MS } from './Feed.js'

function setup(opts?: {
  fetch?: () => Promise<number[]>
  cached?: { items: number[]; fetchedAt: number } | null
  interval?: number
}) {
  let now = 1_000_000
  const published: unknown[] = []
  const saved: Record<string, unknown> = {}
  const deps: FeedDeps = {
    now: () => now,
    formatTime: ts => `t${ts}`,
    loadCache: () => opts?.cached ?? null,
    saveCache: (k, v) => {
      saved[k] = v
    },
    publish: (_k, payload) => published.push(payload)
  }
  const fetch = vi.fn(opts?.fetch ?? (async () => [1, 2, 3]))
  const feed = new Feed<number>(
    { key: 'test', fetch, interval: () => opts?.interval ?? 60_000 },
    deps
  )
  return {
    feed,
    fetch,
    published,
    saved,
    advance: (ms: number) => {
      now += ms
    }
  }
}

describe('Feed', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts empty and stale before the first fetch', () => {
    const { feed } = setup()
    expect(feed.getPayload()).toMatchObject({
      items: [],
      fetchedAt: null,
      stale: true,
      error: null
    })
  })

  it('fetches, publishes, and caches on success', async () => {
    const { feed, published, saved } = setup()
    await feed.refresh()
    expect(published).toHaveLength(1)
    expect(feed.getPayload()).toMatchObject({
      items: [1, 2, 3],
      stale: false,
      error: null,
      fetchedAtLabel: 't1000000'
    })
    expect(saved.test).toEqual({ items: [1, 2, 3], fetchedAt: 1_000_000 })
  })

  it('keeps last good data and marks stale when a fetch fails', async () => {
    let fail = false
    const { feed } = setup({
      fetch: async () => {
        if (fail) throw new Error('boom')
        return [7]
      }
    })
    await feed.refresh()
    fail = true
    await feed.refresh()
    expect(feed.getPayload()).toMatchObject({
      items: [7],
      stale: true,
      error: 'boom'
    })
  })

  it('recovers after a failure', async () => {
    let fail = true
    const { feed } = setup({
      fetch: async () => {
        if (fail) throw new Error('boom')
        return [9]
      }
    })
    await feed.refresh()
    fail = false
    await feed.refresh()
    expect(feed.getPayload()).toMatchObject({ stale: false, error: null })
  })

  it('goes stale after twice the interval without a refresh', async () => {
    const { feed, advance } = setup({ interval: 60_000 })
    await feed.refresh()
    advance(120_000)
    expect(feed.getPayload().stale).toBe(false)
    advance(1)
    expect(feed.getPayload().stale).toBe(true)
  })

  it('loads cached data on construction', () => {
    const { feed } = setup({
      cached: { items: [5], fetchedAt: 999_000 }
    })
    expect(feed.getPayload()).toMatchObject({
      items: [5],
      fetchedAt: 999_000,
      stale: false
    })
  })

  it('rate limits requestRefresh to one per 15s', async () => {
    const { feed, fetch, advance } = setup()
    expect(feed.requestRefresh()).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(feed.requestRefresh()).toBe(false)
    advance(REFRESH_RATE_LIMIT_MS - 1)
    expect(feed.requestRefresh()).toBe(false)
    advance(1)
    expect(feed.requestRefresh()).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight fetch', async () => {
    const { feed, fetch } = setup()
    await Promise.all([feed.refresh(), feed.refresh()])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('polls on the interval while running and stops on stop()', async () => {
    const { feed, fetch } = setup({ interval: 1000 })
    feed.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetch).toHaveBeenCalledTimes(2)
    feed.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
