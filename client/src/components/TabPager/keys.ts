export const FANTASY_KEY = 'fantasy'

// Maps a Car Thing hardware button to a page index. Buttons 1-3 select by
// position; button 4 jumps to the Fantasy tab.
export function keyToIndex(key: string, pageKeys: string[]): number | null {
  if (key === '1' || key === '2' || key === '3') {
    return Math.min(Number(key) - 1, pageKeys.length - 1)
  }

  if (key === '4') {
    const i = pageKeys.indexOf(FANTASY_KEY)
    return i === -1 ? null : i
  }

  return null
}
