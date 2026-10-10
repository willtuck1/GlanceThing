import { describe, expect, it } from 'vitest'

import type { PresetField } from './presetTypes.js'
import {
  checkTemplate,
  fillTemplate,
  templatePlaceholders
} from './template.js'

const text: PresetField = { key: 'q', label: 'Query', kind: 'text' }
const opt: PresetField = {
  key: 'tag',
  label: 'Tag',
  kind: 'text',
  optional: true
}
const secret: PresetField = {
  key: 'token',
  label: 'Token',
  kind: 'secret',
  headerName: 'Authorization'
}
const base: PresetField = { key: 'base', label: 'Server', kind: 'baseUrl' }
const city: PresetField = {
  key: 'city',
  label: 'City',
  kind: 'choice',
  lookup: { kind: 'geocode' }
}

function err(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return (e as Error).message
  }
  throw new Error('expected a throw')
}

describe('templatePlaceholders', () => {
  it('lists raw names including suffixes', () => {
    expect(
      templatePlaceholders(
        'https://a.com/{{q}}?lat={{city.lat}}&lon={{city.lon}}'
      )
    ).toEqual(['q', 'city.lat', 'city.lon'])
    expect(templatePlaceholders('https://a.com/x')).toEqual([])
  })

  it('throws on malformed braces', () => {
    expect(() => templatePlaceholders('https://a.com/{{q')).toThrow()
    expect(() => templatePlaceholders('https://a.com/q}}')).toThrow()
    expect(() => templatePlaceholders('https://a.com/{{}}')).toThrow()
    expect(() => templatePlaceholders('https://a.com/{{a b}}')).toThrow()
    expect(() =>
      templatePlaceholders('https://a.com/{{a{{b}}}}')
    ).toThrow()
  })
})

describe('encoding', () => {
  const tpl = 'https://api.example.com/v1/{{q}}/data?tag={{tag}}'

  it('encodes reserved characters and unicode', () => {
    const url = fillTemplate(tpl, [text, opt], {
      q: 'a/b?c#d&e%f g',
      tag: 'café ☕'
    })
    expect(url).toBe(
      'https://api.example.com/v1/a%2Fb%3Fc%23d%26e%25f%20g/data?tag=caf%C3%A9%20%E2%98%95'
    )
  })

  it.each(['x/../../admin', 'a?b=c#d', '@evil.com', '\\..\\admin'])(
    'keeps host and path structure for %s',
    v => {
      const u = new URL(fillTemplate(tpl, [text, opt], { q: v }))
      expect(u.host).toBe('api.example.com')
      expect(u.pathname.startsWith('/v1/')).toBe(true)
      expect(u.pathname.endsWith('/data')).toBe(true)
      expect(u.pathname.split('/')).toHaveLength(4)
      expect(u.hash).toBe('')
      expect(u.searchParams.get('tag')).toBe('')
    }
  )

  it('refuses dot segments', () => {
    for (const v of ['.', '..'])
      expect(err(() => fillTemplate(tpl, [text, opt], { q: v }))).toMatch(
        /"\." or "\.\."/
      )
  })

  it('trims values', () => {
    expect(
      fillTemplate('https://a.com/{{q}}', [text], { q: '  hi  ' })
    ).toBe('https://a.com/hi')
  })
})

describe('required and optional', () => {
  it('throws on a missing required value', () => {
    expect(
      err(() => fillTemplate('https://a.com/{{q}}', [text], {}))
    ).toBe('"Query" is required')
    expect(() =>
      fillTemplate('https://a.com/{{q}}', [text], { q: '   ' })
    ).toThrow('required')
  })

  it('fills an empty optional value with nothing', () => {
    expect(
      fillTemplate('https://a.com/x?tag={{tag}}', [opt], { tag: '' })
    ).toBe('https://a.com/x?tag=')
  })

  it('refuses unknown placeholders', () => {
    expect(() => checkTemplate('https://a.com/{{nope}}', [text])).toThrow(
      'Unknown placeholder "nope"'
    )
  })
})

describe('secret fields', () => {
  it('can never be referenced', () => {
    const tpl = 'https://a.com/x?key={{token}}'
    expect(() => checkTemplate(tpl, [secret])).toThrow(/Secret/)
    const msg = err(() =>
      fillTemplate(tpl, [secret], { token: 'sk-SUPERSECRET' })
    )
    expect(msg).toMatch(/Secret/)
    expect(msg).not.toContain('SUPERSECRET')
  })
})

describe('baseUrl', () => {
  const tpl = '{{base}}/api/states/{{q}}'

  it.each([
    ['http://homeassistant.local:8123', 'http://homeassistant.local:8123'],
    ['https://ha.example.com/', 'https://ha.example.com'],
    ['https://ha.example.com///', 'https://ha.example.com']
  ])('accepts %s', (v, origin) => {
    expect(fillTemplate(tpl, [base, text], { base: v, q: 'sun' })).toBe(
      `${origin}/api/states/sun`
    )
  })

  it.each([
    'https://ha.example.com/sub',
    'https://ha.example.com?x=1',
    'https://ha.example.com#frag',
    'https://user:pw@ha.example.com',
    'ftp://ha.example.com',
    'not a url'
  ])('rejects %s without echoing it', v => {
    const msg = err(() =>
      fillTemplate(tpl, [base, text], { base: v, q: 'a' })
    )
    expect(msg).toMatch(/Server/)
    expect(msg).not.toContain('ha.example.com')
  })

  it('rejects an empty base URL', () => {
    expect(() =>
      fillTemplate(tpl, [base, text], { base: '', q: 'a' })
    ).toThrow('"Server" is required')
  })

  it('must be at the very start', () => {
    expect(() =>
      checkTemplate('https://a.com/{{base}}/x', [base])
    ).toThrow(/very start/)
    expect(() => checkTemplate('x{{base}}/x', [base])).toThrow(
      /very start/
    )
    expect(() => checkTemplate('{{base}}.evil.com/x', [base])).toThrow()
    expect(() => checkTemplate('{{base}}/a/{{base}}', [base])).toThrow(
      /very start/
    )
  })
})

describe('geocode fields', () => {
  const tpl =
    'https://api.example.com/forecast?lat={{city.lat}}&lon={{city.lon}}'

  it('fills lat and lon', () => {
    expect(fillTemplate(tpl, [city], { city: '51.5072, -0.1276' })).toBe(
      'https://api.example.com/forecast?lat=51.5072&lon=-0.1276'
    )
  })

  it.each(['91,0', '0,181', '-90.5,0', 'abc,def', '1e2,3', '1,2,3', '12'])(
    'rejects %s',
    v => {
      const msg = err(() => fillTemplate(tpl, [city], { city: v }))
      expect(msg).toBe('"City" is not a valid location')
    }
  )

  it('refuses bare or unknown suffixes', () => {
    expect(() =>
      checkTemplate('https://a.com/x?c={{city}}', [city])
    ).toThrow(/city\.lat/)
    expect(() =>
      checkTemplate('https://a.com/x?c={{city.alt}}', [city])
    ).toThrow(/city\.lat/)
    expect(() => checkTemplate('https://a.com/{{q.lat}}', [text])).toThrow(
      /suffix/
    )
  })
})

describe('scheme and host', () => {
  it('refuses placeholders in the host', () => {
    expect(() =>
      checkTemplate('https://{{q}}.example.com/', [text])
    ).toThrow(/path or query/)
    expect(() =>
      checkTemplate('https://example.com{{q}}', [text])
    ).toThrow(/path or query/)
    expect(() => checkTemplate('https://{{q}}', [text])).toThrow(
      /path or query/
    )
  })

  it('refuses placeholders in the fragment', () => {
    expect(() => checkTemplate('https://a.com/x#{{q}}', [text])).toThrow(
      /path or query/
    )
  })

  it('requires https without a base URL', () => {
    expect(() => checkTemplate('http://a.com/{{q}}', [text])).toThrow(
      /https/
    )
    expect(() => checkTemplate('{{q}}/x', [text])).toThrow(/https/)
  })
})

describe('error messages', () => {
  it('never contain the offending value', () => {
    const v = 'VALUE-1234'
    const cases: (() => unknown)[] = [
      () => fillTemplate('https://a.com/{{q}}', [text], { q: '..' }),
      () => fillTemplate('{{base}}/x', [base], { base: `ftp://${v}` }),
      () =>
        fillTemplate('https://a.com/?c={{city.lat}}', [city], {
          city: `${v},1`
        }),
      () => fillTemplate('https://a.com/{{token}}', [secret], { token: v })
    ]
    for (const c of cases) expect(err(c)).not.toContain(v)
  })
})
