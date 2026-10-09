import { describe, expect, it } from 'vitest'

import { modules } from './registry.ts'

describe('module registry', () => {
  it('lists every module once, in tab order', () => {
    expect(modules.map(m => m.id)).toEqual([
      'weather',
      'calendar',
      'todo',
      'sports',
      'fantasy',
      'spotify'
    ])
  })

  it('gives every module a label', () => {
    for (const m of modules) expect(m.label).not.toBe('')
  })
})
