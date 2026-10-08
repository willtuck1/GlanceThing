import { describe, expect, it } from 'vitest'

import { rgba, splitTint, tint } from './tint.ts'

describe('tint', () => {
  it('turns a hex color into a muted rgba', () => {
    expect(rgba('#860038')).toBe('rgba(134, 0, 56, 0.45)')
    expect(rgba('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)')
  })

  it('rejects anything that is not #rrggbb', () => {
    expect(rgba(undefined)).toBeNull()
    expect(rgba('860038')).toBeNull()
    expect(rgba('red')).toBeNull()
    expect(rgba('#fff')).toBeNull()
    expect(tint('url(x)')).toBeUndefined()
  })

  it('fills the whole row with one color', () => {
    expect(tint('#4285f4')).toBe(
      'linear-gradient(rgba(66, 133, 244, 0.45), rgba(66, 133, 244, 0.45))'
    )
  })

  it('splits the row down the middle, left then right', () => {
    expect(splitTint('#552583', '#008348')).toBe(
      'linear-gradient(to right, rgba(85, 37, 131, 0.45) 50%, rgba(0, 131, 72, 0.45) 50%)'
    )
  })

  it('can split anywhere', () => {
    expect(splitTint('#552583', '#008348', '281px')).toBe(
      'linear-gradient(to right, rgba(85, 37, 131, 0.45) 281px, rgba(0, 131, 72, 0.45) 281px)'
    )
  })

  it('leaves a half plain when its color is missing', () => {
    expect(splitTint(undefined, '#008348')).toBe(
      'linear-gradient(to right, rgba(0, 0, 0, 0) 50%, rgba(0, 131, 72, 0.45) 50%)'
    )
    expect(splitTint(undefined, undefined)).toBeUndefined()
  })
})
