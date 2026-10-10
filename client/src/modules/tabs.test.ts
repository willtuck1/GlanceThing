import { describe, expect, it } from 'vitest'

import { parseTabs, visibleIds } from './tabs.ts'

const IDS = ['weather', 'calendar', 'todo', 'sports']

describe('parseTabs', () => {
  it('parses a valid payload', () => {
    expect(parseTabs({ order: ['a', 'b'], hidden: ['b'] })).toEqual({
      order: ['a', 'b'],
      hidden: ['b'],
      connectors: []
    })
  })

  it('drops non-string entries', () => {
    expect(
      parseTabs({ order: ['a', 1, null], hidden: [{}, 'b'] })
    ).toEqual({ order: ['a'], hidden: ['b'], connectors: [] })
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

describe('parseTabs connectors', () => {
  const base = { order: [], hidden: [] }

  it('keeps valid descriptors and drops invalid ones', () => {
    const parsed = parseTabs({
      ...base,
      connectors: [
        { id: 'json:ab12cd34', label: 'Home', layout: 'list' },
        { id: 'weather', label: 'x', layout: 'list' },
        { id: 'json:1', label: 5, layout: 'list' },
        { id: 'json:2', label: 'x', layout: 'pie' },
        { id: 'json:ab12cd34', label: 'Dup', layout: 'grid' },
        null
      ]
    })
    expect(parsed?.connectors).toEqual([
      { id: 'json:ab12cd34', label: 'Home', layout: 'list' }
    ])
  })

  it('caps long labels', () => {
    const parsed = parseTabs({
      ...base,
      connectors: [
        { id: 'json:a', label: 'x'.repeat(40), layout: 'number' }
      ]
    })
    expect(parsed?.connectors[0].label).toHaveLength(24)
  })

  it('defaults to an empty list', () => {
    expect(parseTabs(base)?.connectors).toEqual([])
    expect(parseTabs({ ...base, connectors: 'x' })?.connectors).toEqual([])
  })
})

describe('visibleIds with connectors', () => {
  const ids = [...IDS, 'json:aaaaaaaa', 'json:bbbbbbbb']
  const s = (order: string[], hidden: string[] = []) => ({
    order,
    hidden,
    connectors: []
  })

  it('respects json ids in order and hidden', () => {
    expect(
      visibleIds(s(['json:bbbbbbbb', 'weather'], ['json:aaaaaaaa']), ids)
    ).toEqual(['json:bbbbbbbb', 'weather', 'calendar', 'todo', 'sports'])
  })

  it('ignores a deleted connector id', () => {
    expect(visibleIds(s(['json:gone', ...IDS]), ids)).toEqual(ids)
  })

  it('appends a new connector visible', () => {
    expect(visibleIds(s(IDS), ids)).toEqual(ids)
  })
})

describe('visibleIds', () => {
  it('returns all ids without settings', () => {
    expect(visibleIds(null, IDS)).toEqual(IDS)
  })

  it('follows the host order', () => {
    expect(
      visibleIds(
        {
          order: ['sports', 'weather', 'todo', 'calendar'],
          hidden: [],
          connectors: []
        },
        IDS
      )
    ).toEqual(['sports', 'weather', 'todo', 'calendar'])
  })

  it('ignores unknown and duplicate ids', () => {
    expect(
      visibleIds(
        {
          order: ['nope', 'todo', 'todo', 'weather'],
          hidden: [],
          connectors: []
        },
        IDS
      )
    ).toEqual(['todo', 'weather', 'calendar', 'sports'])
  })

  it('appends missing ids in registry order', () => {
    expect(
      visibleIds({ order: ['sports'], hidden: [], connectors: [] }, IDS)
    ).toEqual(['sports', 'weather', 'calendar', 'todo'])
  })

  it('removes hidden ids', () => {
    expect(
      visibleIds(
        { order: IDS, hidden: ['calendar', 'nope'], connectors: [] },
        IDS
      )
    ).toEqual(['weather', 'todo', 'sports'])
  })

  it('shows everything when all are hidden', () => {
    expect(
      visibleIds({ order: IDS, hidden: IDS, connectors: [] }, IDS)
    ).toEqual(IDS)
  })
})
