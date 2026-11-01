import { describe, expect, it } from 'vitest'

import { cleanText, parseAgentStatus } from './validate.js'

const base = { source: 'claude-code', sessionId: 'abc-123', state: 'working' }

describe('parseAgentStatus', () => {
  it('accepts a minimal status', () => {
    expect(parseAgentStatus(base)).toEqual(base)
  })

  it.each(['Claude', 'a'.repeat(25), 'a_b', 'a b', ''])(
    'rejects source %j',
    source => {
      expect(parseAgentStatus({ ...base, source })).toBeNull()
    }
  )

  it('accepts a 24-char source', () => {
    expect(parseAgentStatus({ ...base, source: 'a'.repeat(24) })).not.toBeNull()
  })

  it.each(['', '   ', 'x'.repeat(129), 'a\nb', 'a b', 'é'])(
    'rejects sessionId %j',
    sessionId => {
      expect(parseAgentStatus({ ...base, sessionId })).toBeNull()
    }
  )

  it('trims sessionId and accepts 128 chars', () => {
    expect(parseAgentStatus({ ...base, sessionId: ' id ' })?.sessionId).toBe('id')
    expect(
      parseAgentStatus({ ...base, sessionId: 'x'.repeat(128) })
    ).not.toBeNull()
  })

  it('rejects unknown state and non-string fields', () => {
    expect(parseAgentStatus({ ...base, state: 'busy' })).toBeNull()
    expect(parseAgentStatus({ ...base, source: 1 })).toBeNull()
    expect(parseAgentStatus({ ...base, sessionId: 5 })).toBeNull()
    expect(parseAgentStatus({ ...base, label: 3 })).toBeNull()
    expect(parseAgentStatus({ ...base, detail: {} })).toBeNull()
    expect(parseAgentStatus({ ...base, end: 'yes' })).toBeNull()
  })

  it.each([null, undefined, 'x', 3, [base], new Date()])(
    'rejects non-object %j',
    v => {
      expect(parseAgentStatus(v)).toBeNull()
    }
  )

  it('trims and caps label at 24 and detail at 48', () => {
    const r = parseAgentStatus({
      ...base,
      label: '  ' + 'L'.repeat(30) + '  ',
      detail: '  ' + 'D'.repeat(60)
    })
    expect(r?.label).toBe('L'.repeat(24))
    expect(r?.detail).toBe('D'.repeat(48))
  })

  it('omits empty label/detail', () => {
    const r = parseAgentStatus({ ...base, label: ' \u200b ', detail: '' })
    expect(r).toEqual(base)
  })

  it('forces stopped when end is true', () => {
    expect(parseAgentStatus({ ...base, end: true })).toEqual({
      ...base,
      state: 'stopped',
      end: true
    })
    expect(parseAgentStatus({ ...base, end: false })?.state).toBe('working')
  })

  it('drops extra keys', () => {
    const r = parseAgentStatus({ ...base, extra: 1, __proto__x: 2 })
    expect(Object.keys(r!).sort()).toEqual(['sessionId', 'source', 'state'])
  })

  it('returns null when a getter throws', () => {
    const v = { ...base }
    Object.defineProperty(v, 'label', {
      enumerable: true,
      get() {
        throw new Error('boom')
      }
    })
    expect(parseAgentStatus(v)).toBeNull()
  })

  it('returns null for a throwing proxy', () => {
    const p = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('boom')
        }
      }
    )
    expect(parseAgentStatus(p)).toBeNull()
  })
})

describe('cleanText', () => {
  it('returns undefined for non-strings and empty', () => {
    expect(cleanText(1, 10)).toBeUndefined()
    expect(cleanText('   ', 10)).toBeUndefined()
  })

  it('strips C0, DEL, C1, separators, bidi and zero-width chars', () => {
    expect(cleanText('a\u0000b\u007fc\u0085d\u009fe', 50)).toBe('abcde')
    expect(cleanText('one\u2028two\u2029three', 50)).toBe('one two three')
    expect(cleanText('\u202eevil\u202c\u2066x\u2069\u200e\u200f', 50)).toBe(
      'evilx'
    )
    expect(cleanText('z\u200bw\u200dj\ufeff', 50)).toBe('zwj')
  })

  it('collapses whitespace', () => {
    expect(cleanText('  a \t\n  b  ', 50)).toBe('a b')
  })

  it('does not split a surrogate pair at the cap', () => {
    expect(cleanText('ab\u{1F600}cd', 3)).toBe('ab\u{1F600}')
    expect(cleanText('\u{1F600}'.repeat(5), 2)).toBe('\u{1F600}\u{1F600}')
  })
})
