import { Feed } from './Feed.js'
import { FeedKey } from './types.js'

const feeds = new Map<FeedKey, Feed<unknown>>()

export function registerFeed(key: FeedKey, feed: Feed<unknown>) {
  feeds.set(key, feed)
}

export function unregisterAll() {
  feeds.clear()
}

export function getFeed(key: FeedKey) {
  return feeds.get(key) ?? null
}
