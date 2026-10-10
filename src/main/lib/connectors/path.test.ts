import { describe, expect, it } from 'vitest'

import { getPath, parsePath } from './path.js'

describe('parsePath', () => {
  it('parses root, keys and indexes', () => {
    expect(parsePath('')).toEqual([])
    expect(parsePath('a')).toEqual(['a'])
    expect(parsePath('a.b')).toEqual(['a', 'b'])
    expect(parsePath('[0].name')).toEqual([0, 'name'])
    expect(parsePath('a.items[2].x')).toEqual(['a', 'items', 2, 'x'])
    expect(parsePath('m[1][2]')).toEqual(['m', 1, 2])
    expect(parsePath(' a . b ')).toEqual(['a', 'b'])
  })

  it('rejects bad syntax', () => {
    for (const p of [
      'a..b',
      '.a',
      'a.',
      'a[',
      'a[x]',
      'a[-1]',
      'a[0]b',
      'a.[0]',
      '[]',
      'a. .b'
    ])
      expect(() => parsePath(p), p).toThrow(`Invalid path "${p}"`)
  })

  it('rejects prototype keys', () => {
    for (const p of ['__proto__', 'a.constructor', 'prototype.x'])
      expect(() => parsePath(p)).toThrow('Invalid path')
  })

  it('enforces limits', () => {
    expect(parsePath(Array(20).fill('a').join('.'))).toHaveLength(20)
    expect(() => parsePath(Array(21).fill('a').join('.'))).toThrow()
    expect(() => parsePath('a'.repeat(201))).toThrow()
  })
})

describe('getPath', () => {
  const data = { a: { list: [{ n: 1 }, { n: 2 }] }, s: 'x' }
  it('reads values', () => {
    expect(getPath(data, [])).toBe(data)
    expect(getPath(data, parsePath('a.list[1].n'))).toBe(2)
  })
  it('returns undefined for missing', () => {
    expect(getPath(data, parsePath('a.nope.x'))).toBeUndefined()
    expect(getPath(data, parsePath('a.list[5]'))).toBeUndefined()
    expect(getPath(data, parsePath('s.length'))).toBeUndefined()
    expect(getPath(null, ['a'])).toBeUndefined()
  })
  it('ignores inherited properties', () => {
    expect(getPath({}, ['toString'])).toBeUndefined()
    expect(getPath([], ['length'])).toBeUndefined()
    expect(getPath({}, ['__proto__'])).toBeUndefined()
  })
  it('index on object and key on array give undefined', () => {
    expect(getPath({ 0: 'x' }, [0])).toBeUndefined()
    expect(getPath(['x'], ['0'])).toBeUndefined()
  })
})
