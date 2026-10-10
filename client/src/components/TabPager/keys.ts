export const CALENDAR_KEY = 'calendar'

// Button 4 sends the device to sleep on the clock.
export const SLEEP_KEY = '4'
export const isSleepKey = (key: string): boolean => key === SLEEP_KEY

// Maps a Car Thing hardware button to a page index. Button 1 goes to the
// previous tab and 2 to the next (both wrap); 3 jumps to the Calendar tab.
export function keyToIndex(
  key: string,
  current: number,
  pageKeys: string[]
): number | null {
  const count = pageKeys.length

  if (key === '1' && count > 0) return (current - 1 + count) % count
  if (key === '2' && count > 0) return (current + 1) % count

  if (key === '3') {
    const i = pageKeys.indexOf(CALENDAR_KEY)
    return i === -1 ? null : i
  }

  // Button 4 is the sleep key (isSleepKey), not a tab move.
  return null
}

// Keeps the same tab selected when the visible set changes; if it is gone,
// stays at the same position (clamped).
export function indexAfterChange(
  prevKeys: string[],
  prevIndex: number,
  nextKeys: string[]
): number {
  if (nextKeys.length === 0) return 0
  const key = prevKeys[prevIndex]
  const i = key === undefined ? -1 : nextKeys.indexOf(key)
  if (i !== -1) return i
  return Math.max(0, Math.min(prevIndex, nextKeys.length - 1))
}

// Remount key for the pager, decided once on the host's first reply: remount
// only when the visible tabs differ from the default (all, registry order).
export function pagerKeyForFirstReply(
  visible: string[],
  all: string[]
): 'default' | 'host' {
  const same =
    visible.length === all.length &&
    visible.every((id, i) => id === all[i])
  return same ? 'default' : 'host'
}
