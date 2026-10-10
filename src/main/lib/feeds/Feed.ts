import { FeedError } from './errors.js'
import { FeedPayload } from './types.js'

export const STALE_FACTOR = 2
export const REFRESH_RATE_LIMIT_MS = 15_000

export interface FeedDeps {
  now: () => number
  formatTime: (timestamp: number) => string
  loadCache: (key: string) => CachedFeed<unknown> | null
  saveCache: (key: string, value: CachedFeed<unknown> | null) => void
  publish: (key: string, payload: unknown) => void
  log?: (message: string) => void
}

export interface CachedFeed<T> {
  items: T[]
  fetchedAt: number
}

export interface FeedOptions<T> {
  key: string
  fetch: () => Promise<T[]>
  interval: (items: T[]) => number
  // Maps a failed fetch to the message clients see. Defaults to the
  // error's own message.
  describeError?: (e: unknown) => FeedError
}

function defaultDescribe(e: unknown): FeedError {
  return {
    message: e instanceof Error ? e.message : String(e),
    dropItems: false
  }
}

export class Feed<T> {
  private items: T[] = []
  private fetchedAt: number | null = null
  private error: string | null = null
  private lastFetchFailed = false
  private lastRequestAt = Number.NEGATIVE_INFINITY
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private inFlight: Promise<void> | null = null
  // Bumped by reset(), refetch() and dispose() so a fetch that started before it is discarded.
  private generation = 0

  constructor(
    private options: FeedOptions<T>,
    private deps: FeedDeps
  ) {
    const cached = deps.loadCache(options.key) as CachedFeed<T> | null
    if (cached && Array.isArray(cached.items)) {
      this.items = cached.items
      this.fetchedAt =
        typeof cached.fetchedAt === 'number' ? cached.fetchedAt : null
    }
  }

  get key() {
    return this.options.key
  }

  getPayload(): FeedPayload<T> {
    const now = this.deps.now()
    const interval = this.options.interval(this.items)
    const expired =
      this.fetchedAt === null ||
      now - this.fetchedAt > STALE_FACTOR * interval

    return {
      items: this.items,
      fetchedAt: this.fetchedAt,
      fetchedAtLabel:
        this.fetchedAt === null ? '' : this.deps.formatTime(this.fetchedAt),
      stale: this.lastFetchFailed || expired,
      error: this.error
    }
  }

  start() {
    if (this.running) return
    this.running = true
    void this.refresh()
  }

  stop() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  // Stops for good: a fetch already running is dropped, so it neither
  // caches nor publishes. Unlike reset(), keeps the data and the cache.
  dispose() {
    this.stop()
    this.generation++
    this.inFlight = null
  }

  // Called when a client asks for the feed (e.g. tab focus). Limited to one
  // real refresh per REFRESH_RATE_LIMIT_MS.
  requestRefresh() {
    const now = this.deps.now()
    if (now - this.lastRequestAt < REFRESH_RATE_LIMIT_MS) return false
    this.lastRequestAt = now
    void this.refresh()
    return true
  }

  // Forgets all data, e.g. after the account behind the feed is removed.
  // The next refresh publishes the result.
  reset() {
    this.generation++
    this.items = []
    this.fetchedAt = null
    this.error = null
    this.lastFetchFailed = false
    this.inFlight = null
    this.deps.saveCache(this.options.key, null)
  }

  // Fetches now and ignores any fetch already in flight, whose data may
  // predate a change the caller just made (e.g. a task toggled on Google).
  refetch(): Promise<void> {
    this.generation++
    this.inFlight = null
    return this.refresh()
  }

  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight

    const inFlight = this.doFetch().finally(() => {
      if (this.inFlight === inFlight) this.inFlight = null
      this.schedule()
    })
    this.inFlight = inFlight

    return inFlight
  }

  private async doFetch() {
    const generation = this.generation
    try {
      const items = await this.options.fetch()
      if (generation !== this.generation) return
      this.items = items
      this.fetchedAt = this.deps.now()
      this.error = null
      this.lastFetchFailed = false
      this.deps.saveCache(this.options.key, {
        items,
        fetchedAt: this.fetchedAt
      })
    } catch (e) {
      if (generation !== this.generation) return
      const { message, dropItems } = (
        this.options.describeError ?? defaultDescribe
      )(e)
      this.lastFetchFailed = true
      this.error = message
      if (dropItems) {
        this.items = []
        this.fetchedAt = null
        this.deps.saveCache(this.options.key, null)
      }
      const raw = e instanceof Error ? e.message : String(e)
      this.deps.log?.(`Fetch failed for ${this.options.key}: ${raw}`)
    }

    this.deps.publish(this.options.key, this.getPayload())
  }

  private schedule() {
    if (!this.running) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(
      () => void this.refresh(),
      this.options.interval(this.items)
    )
  }
}
