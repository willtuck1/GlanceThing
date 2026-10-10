import { describe, expect, it } from 'vitest'
import { joinPath, relativePath, suggestMapping } from './suggestMapping'

describe('suggestMapping', () => {
  it('suggests a list for a news-like array', () => {
    const r = suggestMapping({
      status: 'ok',
      data: {
        items: [
          { id: 1, title: 'Story A', source: 'BBC', score: 120 },
          { id: 2, title: 'Story B', source: 'AP', score: 80 }
        ]
      }
    })
    expect(r).toEqual({
      layout: 'list',
      mapping: {
        itemsPath: 'data.items',
        primary: 'title',
        secondary: 'source',
        value: 'score'
      }
    })
  })

  it('handles a root array and prefers description-like secondaries', () => {
    const r = suggestMapping([
      { id: 'a', name: 'One', note: 'x', status: 'open', price: '3' },
      { id: 'b', name: 'Two', note: 'y', status: 'closed', price: '4' }
    ])
    expect(r?.layout).toBe('list')
    expect(r?.mapping).toEqual({
      itemsPath: '',
      primary: 'name',
      secondary: 'status',
      value: 'price'
    })
  })

  it('goes one level into nested objects', () => {
    const r = suggestMapping({
      list: [
        { name: 'Oslo', note: 'n', main: { temp: 4.5 } },
        { name: 'Rome', note: 'm', main: { temp: 18 } }
      ]
    })
    expect(r?.mapping).toMatchObject({
      itemsPath: 'list',
      primary: 'name',
      value: 'main.temp'
    })
  })

  it('suggests a grid for label + number items', () => {
    const r = suggestMapping({
      rates: [
        { name: 'USD', value: 1 },
        { name: 'EUR', value: 0.9 },
        { name: 'GBP', value: 0.8 }
      ]
    })
    expect(r).toEqual({
      layout: 'grid',
      mapping: { itemsPath: 'rates', label: 'name', value: 'value' }
    })
  })

  it('stays a list with only two label+number items', () => {
    const r = suggestMapping([
      { name: 'USD', value: 1 },
      { name: 'EUR', value: 0.9 }
    ])
    expect(r?.layout).toBe('list')
  })

  it('suggests a number with a caption', () => {
    const r = suggestMapping({
      data: { name: 'Bitcoin', symbol: 'BTC', price: 64000.5, id: 7 }
    })
    expect(r).toEqual({
      layout: 'number',
      mapping: { value: 'data.price', caption: 'data.name' }
    })
  })

  it('number without caption', () => {
    expect(suggestMapping({ usd: 3, timestamp: 1700000000 })).toEqual({
      layout: 'number',
      mapping: { value: 'usd' }
    })
  })

  it('suggests keyvalue for a flat object', () => {
    const r = suggestMapping({
      current_temp: 21,
      feelsLike: 20,
      humidity: 40,
      summary: 'Sunny',
      nothing: null
    })
    expect(r).toEqual({
      layout: 'keyvalue',
      mapping: {
        pairs: [
          { label: 'Current temp', path: 'current_temp' },
          { label: 'Feels like', path: 'feelsLike' },
          { label: 'Humidity', path: 'humidity' },
          { label: 'Summary', path: 'summary' }
        ]
      }
    })
  })

  it('keyvalue picks the richest nested object and caps at 8 pairs', () => {
    const big: Record<string, number> = {}
    for (let i = 0; i < 12; i++) big['k' + i] = i
    const r = suggestMapping({ meta: { a: 1 }, data: big })
    const m = r!.mapping as { pairs: { label: string; path: string }[] }
    expect(r?.layout).toBe('keyvalue')
    expect(m.pairs).toHaveLength(8)
    expect(m.pairs[0]).toEqual({ label: 'K0', path: 'data.k0' })
  })

  it('picks the largest array, shallowest on ties, first on equal', () => {
    const r = suggestMapping({
      a: { deep: [{ title: 'x' }, { title: 'y' }] },
      b: [{ name: 'p' }, { name: 'q' }],
      c: [{ label: 'r' }, { label: 's' }]
    })
    expect(r?.mapping).toMatchObject({ itemsPath: 'b', primary: 'name' })
    const bigger = suggestMapping({
      b: [{ name: 'p' }],
      x: { y: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] }
    })
    expect(bigger?.mapping).toMatchObject({ itemsPath: 'x.y' })
  })

  it('finds arrays inside arrays with index paths', () => {
    const r = suggestMapping([
      { rows: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }
    ])
    expect(r?.mapping).toMatchObject({
      itemsPath: '[0].rows',
      primary: 'name'
    })
  })

  it('ignores keys it cannot address', () => {
    const r = suggestMapping([{ 'a.b': 'x', ok: 'fine' }])
    expect(r?.mapping).toMatchObject({ primary: 'ok' })
  })

  it('returns null for strings, empties and scalars', () => {
    expect(suggestMapping('hello')).toBeNull()
    expect(suggestMapping(null)).toBeNull()
    expect(suggestMapping(5)).toBeNull()
    expect(suggestMapping({})).toBeNull()
    expect(suggestMapping([])).toBeNull()
    expect(suggestMapping({ a: [], b: { c: {} } })).toBeNull()
    expect(suggestMapping([1, 2, 3])).toBeNull()
  })

  it('mappings satisfy the validator shape', () => {
    const samples = [
      {
        items: [
          { title: 'a', score: 1 },
          { title: 'b', score: 2 }
        ]
      },
      { data: { price: 3 } },
      { a: 1, b: 2 }
    ]
    const pathOk = (p: string) =>
      p.length <= 200 &&
      /^([^.[\]]*(\[\d+\])*)(\.[^.[\]]+(\[\d+\])*)*$/.test(p)
    for (const s of samples) {
      const m = suggestMapping(s)!.mapping as unknown as Record<
        string,
        unknown
      >
      for (const [k, v] of Object.entries(m))
        if (k === 'pairs')
          for (const p of v as { label: string; path: string }[]) {
            expect(p.label.length).toBeLessThanOrEqual(40)
            expect(pathOk(p.path) && p.path !== '').toBe(true)
          }
        else if (typeof v === 'string' && k !== 'itemsPath')
          expect(v !== '' && pathOk(v)).toBe(true)
    }
  })
})

describe('joinPath', () => {
  it('joins keys and indexes', () => {
    expect(joinPath('', 'a')).toBe('a')
    expect(joinPath('a', 'b')).toBe('a.b')
    expect(joinPath('', 0)).toBe('[0]')
    expect(joinPath('a.b', 2)).toBe('a.b[2]')
    expect(joinPath('[0]', 'name')).toBe('[0].name')
    expect(joinPath('a[1]', 0)).toBe('a[1][0]')
  })
})

describe('relativePath', () => {
  it('strips the items prefix', () => {
    expect(relativePath('data.items', 'data.items[2].price')).toBe('price')
    expect(relativePath('data.items', 'data.items[0].main.temp')).toBe(
      'main.temp'
    )
  })
  it('handles root arrays', () => {
    expect(relativePath('', '[0].name')).toBe('name')
    expect(relativePath('', '[3]')).toBeNull()
    expect(relativePath('', 'name')).toBeNull()
  })
  it('returns null outside the array', () => {
    expect(relativePath('data.items', 'data.other')).toBeNull()
    expect(relativePath('data.items', 'data.items')).toBeNull()
    expect(relativePath('data.items', 'data.items2[0].x')).toBeNull()
    expect(relativePath('data.items', 'data.items[2]')).toBeNull()
  })
  it('keeps nested indexes', () => {
    expect(relativePath('a', 'a[1][0].x')).toBe('[0].x')
    expect(relativePath('a', 'a[1].tags[0]')).toBe('tags[0]')
  })
})
