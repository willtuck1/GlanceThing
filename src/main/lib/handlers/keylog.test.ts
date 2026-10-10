import { describe, expect, it, vi } from 'vitest'

vi.mock('../clock/settings.js', () => ({ getClockSettings: () => ({}) }))
vi.mock('../utils.js', () => ({ log: () => {} }))

import { sanitizeKeyLog } from './keylog.js'

describe('sanitizeKeyLog', () => {
  it('keeps known fields, truncates strings, drops non-finite numbers', () => {
    const out = sanitizeKeyLog({
      kind: 'keydown',
      key: 'x'.repeat(50),
      keyCode: 13,
      dx: NaN,
      dy: Infinity,
      secret: 'token'
    })
    expect(out).toContain('kind="keydown"')
    expect(out).toContain(`key="${'x'.repeat(20)}"`)
    expect(out).toContain('keyCode=13')
    expect(out).not.toContain('dx')
    expect(out).not.toContain('dy')
    expect(out).not.toContain('token')
  })

  it('handles garbage', () => {
    expect(sanitizeKeyLog(null)).toBe('')
    expect(sanitizeKeyLog('x')).toBe('')
  })
})
