import { describe, expect, it } from 'vitest'

import { CALENDAR_KEY, keyToIndex } from './keys.ts'

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
