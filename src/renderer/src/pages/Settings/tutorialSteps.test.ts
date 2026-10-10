import { describe, expect, it } from 'vitest'

import {
  TUTORIAL_SEEN_KEY,
  TUTORIAL_STEPS,
  isLastStep,
  nextStep,
  prevStep,
  shouldAutoOpen
} from './tutorialSteps.js'

describe('tutorial steps', () => {
  it('has a sensible number of short steps', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThan(0)
    expect(TUTORIAL_STEPS.length).toBeLessThanOrEqual(7)
    for (const s of TUTORIAL_STEPS) {
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.title.length).toBeLessThanOrEqual(40)
      expect(s.body.length).toBeGreaterThan(0)
      expect(s.body.length).toBeLessThanOrEqual(300)
    }
  })

  it('moves between steps within bounds', () => {
    expect(nextStep(0, 3)).toBe(1)
    expect(nextStep(2, 3)).toBe(2)
    expect(prevStep(1)).toBe(0)
    expect(prevStep(0)).toBe(0)
  })

  it('detects the last step', () => {
    expect(isLastStep(1, 3)).toBe(false)
    expect(isLastStep(2, 3)).toBe(true)
  })

  it('auto-opens unless seen', () => {
    expect(TUTORIAL_SEEN_KEY).toBe('connectorTutorialSeen')
    expect(shouldAutoOpen(undefined)).toBe(true)
    expect(shouldAutoOpen(null)).toBe(true)
    expect(shouldAutoOpen(false)).toBe(true)
    expect(shouldAutoOpen('false')).toBe(true)
    expect(shouldAutoOpen(true)).toBe(false)
    expect(shouldAutoOpen('true')).toBe(false)
  })
})
