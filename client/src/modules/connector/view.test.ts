import { describe, expect, it } from 'vitest'

import { moreLabel } from './view.ts'

describe('moreLabel', () => {
  it('formats the overflow count', () => {
    expect(moreLabel(3)).toBe('+3 more')
  })
})
