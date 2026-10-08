import { Feed } from './Feed.js'
import { FeedKey, FeedPayload } from './types.js'

// Shapes a feed's payload before it is sent, e.g. sorting by user settings.
export type FeedDecorator = (payload: FeedPayload<unknown>) => unknown

const feeds = new Map<FeedKey, Feed<unknown>>()
const decorators = new Map<FeedKey, FeedDecorator>()

export function registerFeed(
  key: FeedKey,
  feed: Feed<unknown>,
  decorate?: FeedDecorator
) {
  feeds.set(key, feed)
  if (decorate) decorators.set(key, decorate)
}

export function unregisterAll() {
  feeds.clear()
  decorators.clear()
}

export function getFeed(key: FeedKey) {
  return feeds.get(key) ?? null
}

export function decoratePayload(
  key: FeedKey,
  payload: FeedPayload<unknown>
) {
  const decorate = decorators.get(key)
  return decorate ? decorate(payload) : payload
}

// The payload as clients should see it, or null if the feed is not running.
export function getFeedPayload(key: FeedKey) {
  const feed = getFeed(key)
  if (!feed) return null
  return decoratePayload(key, feed.getPayload())
}
