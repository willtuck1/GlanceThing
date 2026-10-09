import { describe, expect, it } from 'vitest'

import { resolveSnap } from './snap.ts'

// The pager has five tabs since the Fantasy tab: Calendar, To-do, Sports,
// Fantasy, Spotify.
const base = { width: 800, elapsedMs: 1000, count: 5 }

describe('resolveSnap with five tabs', () => {
  it('swipes forward through every tab to the last', () => {
    let index = 0
    const seen = [index]
    for (let i = 0; i < 6; i++) {
      index = resolveSnap({ ...base, dx: -300, index })
      seen.push(index)
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 4, 4])
  })

  it('swipes back from the last tab', () => {
    expect(resolveSnap({ ...base, dx: 300, index: 4 })).toBe(3)
    expect(resolveSnap({ ...base, dx: 300, index: 0 })).toBe(0)
  })

  it('stays put on a short, slow drag', () => {
    expect(resolveSnap({ ...base, dx: -100, index: 3 })).toBe(3)
  })

  it('snaps on a quick flick', () => {
    expect(resolveSnap({ ...base, dx: -60, elapsedMs: 80, index: 3 })).toBe(4)
  })
})
