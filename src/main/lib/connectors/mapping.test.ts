import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import { applyMapping, clean, formatValue } from './mapping.js'

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
  )
}
const ha = fixture('ha-states.json')
const haOne = fixture('ha-state.json')
const nested = fixture('nested.json')

describe('formatValue', () => {
  it('formats numbers', () => {
    expect(formatValue(1234.5678)).toBe('1,234.57')
    expect(formatValue(3)).toBe('3')
    expect(formatValue(3, { decimals: 1 })).toBe('3.0')
    expect(formatValue(Infinity)).toBe('')
    expect(formatValue(NaN)).toBe('')
  })
  it('handles other types', () => {
    expect(formatValue('abc')).toBe('abc')
    expect(formatValue(true)).toBe('Yes')
    expect(formatValue(false)).toBe('No')
    for (const v of [null, undefined, {}, [1]])
      expect(formatValue(v)).toBe('')
  })
  it('keeps numeric strings unless numeric layout', () => {
    expect(formatValue('21.567')).toBe('21.567')
    expect(formatValue('21.567', { numeric: true })).toBe('21.57')
    expect(formatValue(' -4 ', { numeric: true, decimals: 1 })).toBe(
      '-4.0'
    )
    expect(formatValue('on', { numeric: true })).toBe('on')
  })
})

describe('clean', () => {
  it('strips control chars and collapses whitespace', () => {
    expect(clean('a\n\t b\u0007\u202e  c\u2028', 50)).toBe('a b c')
  })
  it('truncates with ellipsis', () => {
    const r = clean('x'.repeat(100), 10)
    expect(r).toHaveLength(10)
    expect(r.endsWith('…')).toBe(true)
    expect(clean('abc', 3)).toBe('abc')
  })
})

describe('applyMapping', () => {
  it('list: caps rows and counts more', () => {
    const v = applyMapping(
      'list',
      {
        itemsPath: 'data.items',
        primary: 'name',
        value: 'price',
        secondary: 'meta.tag'
      },
      nested
    )
    if (v.layout !== 'list') throw new Error()
    expect(v.rows).toHaveLength(20)
    expect(v.more).toBe(5)
    expect(v.rows[0]).toEqual({
      primary: 'Item 1',
      secondary: 't1',
      value: '1.5'
    })
    expect(v.rows[1].value).toBe('')
    expect(v.rows[2].primary).toHaveLength(80)
    expect(v.rows[3].primary).toBe('Line one line two end')
  })
  it('list: omits unset optional keys', () => {
    const v = applyMapping(
      'list',
      { itemsPath: '', primary: 'attributes.friendly_name' },
      ha
    )
    if (v.layout !== 'list') throw new Error()
    expect(v.rows).toHaveLength(5)
    expect(v.more).toBe(0)
    expect(Object.keys(v.rows[0])).toEqual(['primary'])
  })
  it('list/grid: non-array items path throws', () => {
    expect(() =>
      applyMapping('list', { itemsPath: 'data', primary: 'x' }, nested)
    ).toThrow('Items path is not a list')
    expect(() =>
      applyMapping(
        'grid',
        { itemsPath: 'zzz', label: 'a', value: 'b' },
        nested
      )
    ).toThrow('Items path is not a list')
  })
  it('grid: caps cells', () => {
    const v = applyMapping(
      'grid',
      { itemsPath: 'data.items', label: 'name', value: 'meta.tag' },
      nested
    )
    if (v.layout !== 'grid') throw new Error()
    expect(v.cells).toHaveLength(12)
    expect(v.more).toBe(13)
    expect(v.cells[0]).toEqual({ label: 'Item 1', value: 't1' })
  })
  it('number: numeric string, decimals, unit, caption', () => {
    const v = applyMapping(
      'number',
      {
        value: 'state',
        unit: '°C',
        caption: 'attributes.friendly_name',
        decimals: 2
      },
      haOne
    )
    expect(v).toEqual({
      layout: 'number',
      value: '21.50',
      unit: '°C',
      caption: 'Living Room Temperature'
    })
    const bare = applyMapping('number', { value: 'state' }, haOne)
    expect(bare).toEqual({ layout: 'number', value: '21.5' })
    expect(applyMapping('number', { value: 'missing' }, haOne)).toEqual({
      layout: 'number',
      value: ''
    })
  })
  it('keyvalue: caps pairs and tolerates missing', () => {
    const pairs = Array.from({ length: 10 }, (_, i) => ({
      label: `L${i}`,
      path: 'state'
    }))
    const v = applyMapping('keyvalue', { pairs }, haOne)
    if (v.layout !== 'keyvalue') throw new Error()
    expect(v.pairs).toHaveLength(8)
    expect(v.pairs[0]).toEqual({ label: 'L0', value: '21.5' })
    const w = applyMapping(
      'keyvalue',
      { pairs: [{ label: 'x', path: 'attributes' }] },
      haOne
    )
    expect(w).toEqual({
      layout: 'keyvalue',
      pairs: [{ label: 'x', value: '' }]
    })
  })
})
