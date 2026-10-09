import { describe, expect, it } from 'vitest'

import { CALENDAR_KEY, indexAfterChange, keyToIndex } from './keys.ts'

const KEYS = ['weather', 'calendar', 'todo', 'sports', 'spotify']

describe('keyToIndex', () => {
  it('moves to the previous tab with button 1', () => {
    expect(keyToIndex('1', 3, KEYS)).toBe(2)
    expect(keyToIndex('1', 1, KEYS)).toBe(0)
  })

  it('wraps button 1 from the first tab to the last', () => {
    expect(keyToIndex('1', 0, KEYS)).toBe(4)
  })

  it('moves to the next tab with button 2', () => {
    expect(keyToIndex('2', 0, KEYS)).toBe(1)
    expect(keyToIndex('2', 3, KEYS)).toBe(4)
  })

  it('wraps button 2 from the last tab to the first', () => {
    expect(keyToIndex('2', 4, KEYS)).toBe(0)
  })

  it('jumps to the calendar page with button 3', () => {
    expect(CALENDAR_KEY).toBe('calendar')
    expect(keyToIndex('3', 4, KEYS)).toBe(1)
    expect(keyToIndex('3', 1, KEYS)).toBe(1)
    expect(keyToIndex('3', 0, ['calendar', 'todo'])).toBe(0)
  })

  it('ignores button 3 without a calendar page', () => {
    expect(keyToIndex('3', 0, ['weather', 'todo'])).toBeNull()
  })

  it('ignores button 4', () => {
    expect(keyToIndex('4', 0, KEYS)).toBeNull()
  })

  it('ignores other keys', () => {
    expect(keyToIndex('m', 0, KEYS)).toBeNull()
    expect(keyToIndex('Escape', 0, KEYS)).toBeNull()
    expect(keyToIndex('5', 0, KEYS)).toBeNull()
  })
})

describe('keyToIndex on a reduced key list', () => {
  const VISIBLE = ['weather', 'todo', 'sports']

  it('ignores button 3 when the calendar is hidden', () => {
    expect(keyToIndex('3', 0, VISIBLE)).toBeNull()
  })

  it('cycles only the visible tabs with 1 and 2', () => {
    expect(keyToIndex('2', 2, VISIBLE)).toBe(0)
    expect(keyToIndex('1', 0, VISIBLE)).toBe(2)
    expect(keyToIndex('2', 0, VISIBLE)).toBe(1)
  })
})

describe('indexAfterChange', () => {
  const PREV = ['weather', 'calendar', 'todo', 'sports']

  it('stays on the same key when it is still present', () => {
    expect(indexAfterChange(PREV, 2, ['todo', 'weather'])).toBe(0)
    expect(indexAfterChange(PREV, 3, ['weather', 'sports'])).toBe(1)
  })

  it('keeps the position when the key is gone', () => {
    expect(indexAfterChange(PREV, 1, ['weather', 'todo', 'sports'])).toBe(
      1
    )
  })

  it('clamps to the last tab when the position is past the end', () => {
    expect(indexAfterChange(PREV, 3, ['weather', 'todo'])).toBe(1)
  })

  it('returns 0 for an empty list', () => {
    expect(indexAfterChange(PREV, 2, [])).toBe(0)
  })
})
