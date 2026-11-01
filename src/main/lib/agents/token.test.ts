import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
const setCalls: [string, unknown, boolean | undefined][] = []

vi.mock('../storage.js', () => ({
  getStorageValue: (key: string) => store.get(key) ?? null,
  setStorageValue: (key: string, value: unknown, secure?: boolean) => {
    setCalls.push([key, value, secure])
    store.set(key, value)
  }
}))

import {
  _resetAgentsTokenCache,
  AGENTS_TOKEN_KEY,
  getAgentsToken,
  regenerateAgentsToken,
  tokenMatches
} from './token.js'

const HEX64 = /^[0-9a-f]{64}$/

beforeEach(() => {
  store.clear()
  setCalls.length = 0
  _resetAgentsTokenCache()
})

describe('getAgentsToken', () => {
  it('generates a 64-hex token once and stores it securely', () => {
    const t = getAgentsToken()
    expect(t).toMatch(HEX64)
    expect(AGENTS_TOKEN_KEY).toBe('agentsToken')
    expect(setCalls).toEqual([['agentsToken', t, true]])
  })

  it('returns the same token without writing again', () => {
    const t = getAgentsToken()
    expect(getAgentsToken()).toBe(t)
    _resetAgentsTokenCache()
    expect(getAgentsToken()).toBe(t)
    expect(setCalls).toHaveLength(1)
  })

  it('uses a valid stored token without writing', () => {
    const stored = 'a'.repeat(64)
    store.set(AGENTS_TOKEN_KEY, stored)
    expect(getAgentsToken()).toBe(stored)
    expect(setCalls).toHaveLength(0)
  })

  it('replaces an invalid stored value', () => {
    for (const bad of ['short', 'A'.repeat(64), 'g'.repeat(64), 42]) {
      store.set(AGENTS_TOKEN_KEY, bad)
      _resetAgentsTokenCache()
      setCalls.length = 0
      const t = getAgentsToken()
      expect(t).toMatch(HEX64)
      expect(t).not.toBe(bad)
      expect(setCalls).toEqual([['agentsToken', t, true]])
    }
  })
})

describe('regenerateAgentsToken', () => {
  it('changes the token, stores it and updates the cache', () => {
    const first = getAgentsToken()
    const next = regenerateAgentsToken()
    expect(next).toMatch(HEX64)
    expect(next).not.toBe(first)
    expect(setCalls[setCalls.length - 1]).toEqual(['agentsToken', next, true])
    expect(getAgentsToken()).toBe(next)
  })
})

describe('tokenMatches', () => {
  const tok = '0123456789abcdef'.repeat(4)

  it('accepts the correct bearer token, scheme in any case', () => {
    expect(tokenMatches(`Bearer ${tok}`, tok)).toBe(true)
    expect(tokenMatches(`bearer ${tok}`, tok)).toBe(true)
    expect(tokenMatches(`BEARER ${tok}`, tok)).toBe(true)
  })

  it('rejects missing or non-string headers', () => {
    expect(tokenMatches(undefined, tok)).toBe(false)
    expect(tokenMatches(null, tok)).toBe(false)
    expect(tokenMatches(42, tok)).toBe(false)
    expect(tokenMatches(['Bearer ' + tok], tok)).toBe(false)
    expect(tokenMatches('', tok)).toBe(false)
  })

  it('rejects a wrong token', () => {
    expect(tokenMatches(`Bearer ${'f'.repeat(64)}`, tok)).toBe(false)
  })

  it('rejects shorter or longer tokens', () => {
    expect(tokenMatches(`Bearer ${tok.slice(0, 63)}`, tok)).toBe(false)
    expect(tokenMatches(`Bearer ${tok}0`, tok)).toBe(false)
    expect(tokenMatches(`Bearer ${tok}`, tok.slice(0, 63))).toBe(false)
  })

  it('rejects other schemes, extra spaces and a bare token', () => {
    expect(tokenMatches(`Basic ${tok}`, tok)).toBe(false)
    expect(tokenMatches(`Bearer  ${tok}`, tok)).toBe(false)
    expect(tokenMatches(` Bearer ${tok}`, tok)).toBe(false)
    expect(tokenMatches(`Bearer ${tok} `, tok)).toBe(false)
    expect(tokenMatches(`Bearer\t${tok}`, tok)).toBe(false)
    expect(tokenMatches(tok, tok)).toBe(false)
  })

  it('rejects uppercase hex in the header', () => {
    expect(tokenMatches(`Bearer ${tok.toUpperCase()}`, tok)).toBe(false)
  })
})
