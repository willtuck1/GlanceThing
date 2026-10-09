export const CALENDAR_KEY = 'calendar'

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

  // Button 4: reserved for sleep-to-clock (roadmap item 5).
  return null
}
