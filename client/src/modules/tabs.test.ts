import { describe, expect, it } from 'vitest'

import { parseTabs, visibleIds } from './tabs.ts'

const IDS = ['weather', 'calendar', 'todo', 'sports']

describe('parseTabs', () => {
  it('parses a valid payload', () => {
    expect(parseTabs({ order: ['a', 'b'], hidden: ['b'] })).toEqual({
      order: ['a', 'b'],
      hidden: ['b']
    })
  })

  it('drops non-string entries', () => {
    expect(
      parseTabs({ order: ['a', 1, null], hidden: [{}, 'b'] })
    ).toEqual({ order: ['a'], hidden: ['b'] })
  })

  it('returns null for garbage', () => {
    expect(parseTabs(null)).toBeNull()
    expect(parseTabs(undefined)).toBeNull()
    expect(parseTabs('x')).toBeNull()
    expect(parseTabs([])).toBeNull()
    expect(parseTabs({})).toBeNull()
    expect(parseTabs({ order: 'a', hidden: [] })).toBeNull()
    expect(parseTabs({ order: [] })).toBeNull()
  })
})

describe('visibleIds', () => {
  it('returns all ids without settings', () => {
    expect(visibleIds(null, IDS)).toEqual(IDS)
  })

  it('follows the host order', () => {
    expect(
      visibleIds(
        { order: ['sports', 'weather', 'todo', 'calendar'], hidden: [] },
        IDS
      )
    ).toEqual(['sports', 'weather', 'todo', 'calendar'])
  })

  it('ignores unknown and duplicate ids', () => {
    expect(
      visibleIds(
        { order: ['nope', 'todo', 'todo', 'weather'], hidden: [] },
        IDS
      )
    ).toEqual(['todo', 'weather', 'calendar', 'sports'])
  })

  it('appends missing ids in registry order', () => {
    expect(visibleIds({ order: ['sports'], hidden: [] }, IDS)).toEqual([
      'sports',
      'weather',
      'calendar',
      'todo'
    ])
  })

  it('removes hidden ids', () => {
    expect(
      visibleIds({ order: IDS, hidden: ['calendar', 'nope'] }, IDS)
    ).toEqual(['weather', 'todo', 'sports'])
  })

  it('shows everything when all are hidden', () => {
    expect(visibleIds({ order: IDS, hidden: IDS }, IDS)).toEqual(IDS)
  })
})
