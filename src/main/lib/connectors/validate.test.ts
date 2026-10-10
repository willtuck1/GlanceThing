import { describe, expect, it } from 'vitest'

import {
  validateHeaderName,
  validateHeaderValue,
  validateInterval,
  validateLabel,
  validateMapping,
  validateUrl
} from './validate.js'

describe('validateMapping', () => {
  it('normalizes list and drops unknown/empty keys', () => {
    expect(
      validateMapping('list', {
        itemsPath: ' data ',
        primary: ' name ',
        secondary: '',
        value: '  ',
        evil: 1
      })
    ).toEqual({
      layout: 'list',
      mapping: { itemsPath: 'data', primary: 'name' }
    })
  })
  it('allows empty items path (root)', () => {
    expect(
      validateMapping('grid', { itemsPath: '', label: 'a', value: 'b' })
        .mapping
    ).toEqual({
      itemsPath: '',
      label: 'a',
      value: 'b'
    })
  })
  it('requires paths', () => {
    expect(() => validateMapping('list', { itemsPath: '' })).toThrow(
      'List: "Primary" path is required'
    )
    expect(() =>
      validateMapping('grid', { itemsPath: '', label: 'a' })
    ).toThrow('Grid: "Value" path is required')
    expect(() => validateMapping('number', {})).toThrow(
      'Number: "Value" path is required'
    )
  })
  it('checks path syntax', () => {
    expect(() =>
      validateMapping('list', { itemsPath: '', primary: 'x..y' })
    ).toThrow('Invalid path "x..y" in Primary')
    expect(() =>
      validateMapping('list', { itemsPath: 'a[', primary: 'x' })
    ).toThrow('Invalid path "a[" in Items')
  })
  it('number: decimals and unit', () => {
    expect(
      validateMapping('number', { value: 'v', decimals: 3, unit: ' kW ' })
        .mapping
    ).toEqual({
      value: 'v',
      decimals: 3,
      unit: 'kW'
    })
    for (const d of [4, -1, 1.5, '2'])
      expect(() =>
        validateMapping('number', { value: 'v', decimals: d })
      ).toThrow('Number: decimals must be 0-3')
    expect(() =>
      validateMapping('number', { value: 'v', unit: 'x'.repeat(9) })
    ).toThrow('unit')
  })
  it('keyvalue: pairs', () => {
    expect(
      validateMapping('keyvalue', { pairs: [{ label: ' A ', path: 'a' }] })
        .mapping
    ).toEqual({
      pairs: [{ label: 'A', path: 'a' }]
    })
    const many = Array.from({ length: 9 }, () => ({
      label: 'a',
      path: 'a'
    }))
    expect(() => validateMapping('keyvalue', { pairs: many })).toThrow(
      'Key-value: at most 8 pairs'
    )
    expect(() => validateMapping('keyvalue', { pairs: [] })).toThrow(
      'at least one'
    )
    expect(() =>
      validateMapping('keyvalue', { pairs: [{ label: '', path: 'a' }] })
    ).toThrow('label')
    expect(() =>
      validateMapping('keyvalue', {
        pairs: [{ label: 'x'.repeat(41), path: 'a' }]
      })
    ).toThrow('40')
    expect(() =>
      validateMapping('keyvalue', { pairs: [{ label: 'a', path: '' }] })
    ).toThrow('required')
  })
  it('rejects unknown layout and non-objects', () => {
    expect(() => validateMapping('table', {})).toThrow('Unknown layout')
    expect(() => validateMapping('list', null)).toThrow(
      'Mapping must be an object'
    )
  })
})

describe('validateUrl', () => {
  it('accepts http and https', () => {
    expect(validateUrl('https://example.com/api?x=1').hostname).toBe(
      'example.com'
    )
    expect(validateUrl('http://192.0.2.1:8123/api/states').port).toBe(
      '8123'
    )
  })
  it('rejects bad input', () => {
    expect(() => validateUrl(5)).toThrow('URL is required')
    expect(() => validateUrl('ftp://example.com')).toThrow(
      'URL must start with http:// or https://'
    )
    expect(() => validateUrl('not a url')).toThrow('not valid')
    expect(() => validateUrl('https://u:p@example.com')).toThrow(
      'username'
    )
    expect(() =>
      validateUrl('https://example.com/' + 'a'.repeat(2000))
    ).toThrow('too long')
  })
})

describe('label, interval, headers', () => {
  it('label', () => {
    expect(validateLabel('  Power ')).toBe('Power')
    expect(() => validateLabel('  ')).toThrow()
    expect(() => validateLabel('x'.repeat(25))).toThrow('24')
    expect(() => validateLabel(3)).toThrow()
  })
  it('interval', () => {
    expect(validateInterval(1)).toBe(1)
    expect(validateInterval(1440)).toBe(1440)
    for (const v of [0, 1441, 1.5, '5', NaN])
      expect(() => validateInterval(v)).toThrow('Interval')
  })
  it('header name', () => {
    expect(validateHeaderName('X-Api-Key')).toBe('X-Api-Key')
    expect(validateHeaderName('Authorization')).toBe('Authorization')
    for (const v of ['', 'bad name', 'a:b', 'x'.repeat(65), 5])
      expect(() => validateHeaderName(v)).toThrow()
    for (const v of [
      'Host',
      'content-length',
      'TRANSFER-ENCODING',
      'Connection',
      'cookie'
    ])
      expect(() => validateHeaderName(v)).toThrow('not allowed')
  })
  it('header value', () => {
    expect(validateHeaderValue('Bearer abc\tdef')).toBe('Bearer abc\tdef')
    for (const v of [
      '',
      'a\nb',
      'a\rb',
      'a\0b',
      'a\u007fb',
      'x'.repeat(4097),
      7
    ])
      expect(() => validateHeaderValue(v)).toThrow()
  })
  it('header value allows Latin-1 but not wider characters', () => {
    expect(validateHeaderValue('caf\u00e9')).toBe('caf\u00e9')
    for (const v of ['\u20ac5', 'key\u{1f511}'])
      expect(() => validateHeaderValue(v)).toThrow(
        'Header value must use plain ASCII/Latin-1 characters'
      )
  })
})
