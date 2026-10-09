import { describe, expect, it } from 'vitest'

import { rgba, rowTeamColor, tint } from './tint.ts'

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

  it('takes an optional alpha', () => {
    expect(tint('#4285f4', 0.1)).toBe(
      'linear-gradient(rgba(66, 133, 244, 0.1), rgba(66, 133, 244, 0.1))'
    )
    expect(tint(undefined)).toBeUndefined()
  })
})

describe('rowTeamColor', () => {
  const away = { key: 'nba:LAL', color: '#552583' }
  const home = { key: 'nba:BOS', color: '#008348' }

  it('uses the away color with no favorite', () => {
    expect(rowTeamColor(away, home, [])).toBe('#552583')
  })

  it('uses the home color when only home is a favorite', () => {
    expect(rowTeamColor(away, home, ['nba:BOS'])).toBe('#008348')
  })

  it('uses the away color when only away is a favorite', () => {
    expect(rowTeamColor(away, home, ['nba:LAL'])).toBe('#552583')
  })

  it('uses the away color when both are favorites', () => {
    expect(rowTeamColor(away, home, ['nba:LAL', 'nba:BOS'])).toBe('#552583')
  })

  it('does not fall back when the chosen team has no color', () => {
    expect(
      rowTeamColor(away, { key: 'nba:BOS' }, ['nba:BOS'])
    ).toBeUndefined()
  })
})
