import { describe, expect, it } from 'vitest'

import { barHeight, ICON_NAMES, iconFor } from './view.ts'

describe('barHeight', () => {
  it('scales with the percentage', () => {
    expect(barHeight(50, 40)).toBe(20)
    expect(barHeight(100, 40)).toBe(40)
    expect(barHeight(0, 40)).toBe(0)
  })
  it('clamps out-of-range and invalid values', () => {
    expect(barHeight(150, 40)).toBe(40)
    expect(barHeight(-5, 40)).toBe(0)
    expect(barHeight(NaN, 40)).toBe(0)
  })
  it('keeps small chances visible', () => {
    expect(barHeight(1, 40)).toBe(2)
  })
})

describe('iconFor', () => {
  it('passes known names through', () => {
    for (const n of ICON_NAMES) expect(iconFor(n)).toBe(n)
  })
  it('falls back to cloudy', () => {
    expect(iconFor('tornado')).toBe('cloudy')
    expect(iconFor('')).toBe('cloudy')
  })
})
