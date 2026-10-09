import { describe, expect, it } from 'vitest'

import {
  ConnectorForm,
  ConnectorForSettings,
  draftFromForm,
  emptyForm,
  formFromConnector,
  shouldWarnHttpSecret,
  validateForm
} from './connectorForm.js'

function valid(over: Partial<ConnectorForm> = {}): ConnectorForm {
  return {
    ...emptyForm(),
    label: 'Prices',
    url: 'https://example.com/api',
    primary: 'name',
    ...over
  }
}

const stored: ConnectorForSettings = {
  id: 'abcd1234',
  label: 'Prices',
  layout: 'list',
  mapping: { itemsPath: 'data.items', primary: 'name', value: 'price' },
  intervalMin: 30,
  source: {
    kind: 'json',
    url: 'https://example.com/api',
    header: { name: 'X-Key' }
  },
  headerSet: true
}

describe('validateForm', () => {
  it('accepts a valid list form', () => {
    expect(validateForm(valid())).toEqual([])
  })

  it('requires name, url, interval and primary', () => {
    const errors = validateForm(
      valid({ label: ' ', url: 'ftp://x', intervalMin: '0', primary: '' })
    )
    expect(errors).toHaveLength(4)
  })

  it('rejects an unparsable url and non-integer interval', () => {
    expect(validateForm(valid({ url: 'http://' }))).toContain(
      'URL is not valid'
    )
    expect(validateForm(valid({ intervalMin: '1.5' }))).toHaveLength(1)
    expect(validateForm(valid({ intervalMin: '1441' }))).toHaveLength(1)
    expect(validateForm(valid({ intervalMin: '1440' }))).toEqual([])
  })

  it('checks grid, number and key-value layouts', () => {
    expect(validateForm(valid({ layout: 'grid' }))).toHaveLength(2)
    expect(validateForm(valid({ layout: 'number' }))).toHaveLength(1)
    expect(
      validateForm(
        valid({ layout: 'number', numValue: 'a', decimals: '4' })
      )
    ).toEqual(['Decimals must be 0 to 3'])
    expect(
      validateForm(valid({ layout: 'keyvalue', pairs: [] }))
    ).toHaveLength(1)
    expect(
      validateForm(
        valid({ layout: 'keyvalue', pairs: [{ label: '', path: 'a' }] })
      )
    ).toEqual(['Row 1 needs a label'])
    const nine = Array.from({ length: 9 }, () => ({
      label: 'a',
      path: 'b'
    }))
    expect(
      validateForm(valid({ layout: 'keyvalue', pairs: nine }))
    ).toEqual(['At most 8 rows'])
  })

  it('requires header name and value together', () => {
    expect(validateForm(valid({ headerName: 'X' }))).toHaveLength(1)
    expect(validateForm(valid({ headerValue: 'v' }))).toHaveLength(1)
    expect(
      validateForm(valid({ headerName: 'X', headerValue: 'v' }))
    ).toEqual([])
  })
})

describe('draftFromForm', () => {
  it('builds a list draft and drops empty optionals', () => {
    const d = draftFromForm(
      valid({ itemsPath: ' data ', secondary: '  ' })
    )
    expect(d).toEqual({
      label: 'Prices',
      layout: 'list',
      mapping: { itemsPath: 'data', primary: 'name' },
      intervalMin: 15,
      url: 'https://example.com/api'
    })
    expect('header' in d).toBe(false)
  })

  it('builds number mappings with decimals 0', () => {
    const d = draftFromForm(
      valid({
        layout: 'number',
        numValue: 'a.b',
        unit: '%',
        decimals: '0'
      })
    )
    expect(d.mapping).toEqual({ value: 'a.b', unit: '%', decimals: 0 })
  })

  it('builds key-value mappings', () => {
    const d = draftFromForm(
      valid({ layout: 'keyvalue', pairs: [{ label: ' A ', path: ' a ' }] })
    )
    expect(d.mapping).toEqual({ pairs: [{ label: 'A', path: 'a' }] })
  })

  it('sets a new header', () => {
    expect(
      draftFromForm(valid({ headerName: 'X', headerValue: 'v' })).header
    ).toEqual({ name: 'X', value: 'v' })
  })
})

describe('header semantics when editing', () => {
  it('keeps an unchanged header', () => {
    const f = formFromConnector(stored)
    expect(f.id).toBe('abcd1234')
    expect(f.headerValue).toBe('')
    expect(draftFromForm(f).header).toBeUndefined()
    expect('header' in draftFromForm(f)).toBe(false)
    expect(validateForm(f)).toEqual([])
  })

  it('clears a header', () => {
    const f = { ...formFromConnector(stored), headerCleared: true }
    expect(draftFromForm({ ...f, headerName: '' }).header).toBeNull()
    expect(validateForm({ ...f, headerName: '' })).toEqual([])
  })

  it('replaces the value', () => {
    const f = { ...formFromConnector(stored), headerValue: 'new' }
    expect(draftFromForm(f).header).toEqual({
      name: 'X-Key',
      value: 'new'
    })
  })

  it('renames only', () => {
    const f = { ...formFromConnector(stored), headerName: 'X-Other' }
    expect(draftFromForm(f).header).toEqual({ name: 'X-Other' })
  })

  it('sets a new header after clearing', () => {
    const f = {
      ...formFromConnector(stored),
      headerCleared: true,
      headerName: 'A',
      headerValue: 'b'
    }
    expect(draftFromForm(f).header).toEqual({ name: 'A', value: 'b' })
  })
})

describe('formFromConnector', () => {
  it('round-trips each layout', () => {
    const grid: ConnectorForSettings = {
      ...stored,
      layout: 'grid',
      mapping: { itemsPath: '', label: 'k', value: 'v' },
      source: { kind: 'json', url: 'https://e.com' },
      headerSet: false
    }
    expect(draftFromForm(formFromConnector(grid)).mapping).toEqual(
      grid.mapping
    )
    const num: ConnectorForSettings = {
      ...grid,
      layout: 'number',
      mapping: { value: 'v', caption: 'c', unit: 'F', decimals: 0 }
    }
    expect(draftFromForm(formFromConnector(num)).mapping).toEqual(
      num.mapping
    )
    const kv: ConnectorForSettings = {
      ...grid,
      layout: 'keyvalue',
      mapping: { pairs: [{ label: 'A', path: 'a' }] }
    }
    expect(draftFromForm(formFromConnector(kv)).mapping).toEqual(
      kv.mapping
    )
    expect(draftFromForm(formFromConnector(stored)).mapping).toEqual(
      stored.mapping
    )
  })
})

describe('shouldWarnHttpSecret', () => {
  it('warns for http with a new or stored header', () => {
    expect(
      shouldWarnHttpSecret(
        valid({ url: 'http://x.lan', headerName: 'X', headerValue: 'v' })
      )
    ).toBe(true)
    expect(
      shouldWarnHttpSecret({
        ...formFromConnector(stored),
        url: 'http://x.lan'
      })
    ).toBe(true)
  })

  it('does not warn for https or no header', () => {
    expect(
      shouldWarnHttpSecret(valid({ headerName: 'X', headerValue: 'v' }))
    ).toBe(false)
    expect(shouldWarnHttpSecret(valid({ url: 'http://x.lan' }))).toBe(
      false
    )
    expect(
      shouldWarnHttpSecret({
        ...formFromConnector(stored),
        url: 'http://x.lan',
        headerCleared: true
      })
    ).toBe(false)
  })
})
