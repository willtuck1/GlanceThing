import { describe, expect, it } from 'vitest'

import { listenerText, maskToken, stepsFor } from './agentsForm.js'

describe('listenerText', () => {
  it('shows the port when running', () => {
    expect(listenerText({ running: true, port: 47816 })).toBe(
      'Listening on 127.0.0.1:47816'
    )
  })

  it('shows the error when not running', () => {
    expect(
      listenerText({ running: false, port: null, error: 'Port in use' })
    ).toBe('Not listening: Port in use')
  })

  it('handles not running without an error', () => {
    expect(listenerText({ running: false, port: null })).toBe('Not listening')
  })
})

describe('maskToken', () => {
  it('masks all but the last 4', () => {
    const masked = maskToken('a'.repeat(60) + 'wxyz')
    expect(masked).toBe('••••••••wxyz')
  })

  it('reports an empty token', () => {
    expect(maskToken(null)).toBe('Not set')
    expect(maskToken('')).toBe('Not set')
  })
})

describe('stepsFor', () => {
  it('trims and drops blank steps', () => {
    expect(
      stepsFor({ id: 'x', label: 'X', setupSteps: [' one ', '', 'two'] })
    ).toEqual(['one', 'two'])
  })
})
