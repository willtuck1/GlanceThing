import { describe, expect, it } from 'vitest'

import { FANTASY_KEY, keyToIndex } from './keys.ts'

const KEYS = ['calendar', 'todo', 'sports', 'fantasy', 'spotify']

describe('keyToIndex', () => {
  it('maps buttons 1-3 to positions', () => {
    expect(keyToIndex('1', KEYS)).toBe(0)
    expect(keyToIndex('2', KEYS)).toBe(1)
    expect(keyToIndex('3', KEYS)).toBe(2)
  })

  it('clamps buttons 1-3 when there are fewer pages', () => {
    expect(keyToIndex('3', ['calendar', 'todo'])).toBe(1)
    expect(keyToIndex('2', ['calendar'])).toBe(0)
  })

  it('maps button 4 to the fantasy page', () => {
    expect(FANTASY_KEY).toBe('fantasy')
    expect(keyToIndex('4', KEYS)).toBe(3)
  })

  it('ignores button 4 without a fantasy page', () => {
    expect(keyToIndex('4', ['calendar', 'todo'])).toBeNull()
  })

  it('ignores other keys', () => {
    expect(keyToIndex('m', KEYS)).toBeNull()
    expect(keyToIndex('Escape', KEYS)).toBeNull()
    expect(keyToIndex('5', KEYS)).toBeNull()
  })
})
