import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({ store: new Map<string, unknown>() }))

vi.mock('../storage.js', () => ({
  getStorageValue: (key: string) => mem.store.get(key) ?? null,
  setStorageValue: (key: string, value: unknown) => {
    mem.store.set(key, value)
  },
  deleteStorageValue: (key: string) => {
    mem.store.delete(key)
  }
}))

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('./fetch.js', () => ({ fetchConnectorJson: fetchMock }))

// Stand-in for errors.ts: echoes the message so the leak guard is tested.
vi.mock('./errors.js', () => ({
  plainError: (e: unknown) =>
    e instanceof Error && e.message ? e.message : 'Fetch failed'
}))

import {
  fetchSample,
  sanitizeSample,
  sanitizeSampleResult
} from './sample.js'

const SECRET = 'sk-very-secret-value-123'
const URL_ = 'https://api.example.com/data?key=abc'

function nest(levels: number): unknown {
  let v: unknown = 'leaf'
  for (let i = 0; i < levels; i++) v = { a: v }
  return v
}

function depthOf(v: unknown): number {
  if (v === null || typeof v !== 'object') return 0
  const kids = Array.isArray(v) ? v : Object.values(v)
  return 1 + Math.max(0, ...kids.map(depthOf))
}

describe('sanitizeSample', () => {
  it('keeps 8 levels and replaces deeper containers with "…"', () => {
    expect(sanitizeSampleResult(nest(8))).toEqual({
      sample: nest(8),
      truncated: false
    })
    const out = sanitizeSampleResult(nest(10))
    expect(out.truncated).toBe(true)
    expect(depthOf(out.sample)).toBe(8)
    expect(JSON.stringify(out.sample)).toContain('"a":"…"')
  })

  it('cuts arrays to the first 5 items', () => {
    const out = sanitizeSampleResult([1, 2, 3, 4, 5, 6, 7])
    expect(out).toEqual({ sample: [1, 2, 3, 4, 5], truncated: true })
    expect(sanitizeSampleResult([1, 2]).truncated).toBe(false)
  })

  it('cuts strings and keys to 80 characters', () => {
    const long = 'x'.repeat(200)
    const out = sanitizeSample({ [long]: long }) as Record<string, string>
    const [k, v] = Object.entries(out)[0]
    expect(k).toHaveLength(80)
    expect(k.endsWith('…')).toBe(true)
    expect(v).toHaveLength(80)
    expect(v.endsWith('…')).toBe(true)
    expect(sanitizeSample('y'.repeat(80))).toBe('y'.repeat(80))
  })

  it('keeps at most 50 keys per object', () => {
    const obj: Record<string, number> = {}
    for (let i = 0; i < 70; i++) obj[`k${i}`] = i
    const out = sanitizeSampleResult(obj)
    expect(Object.keys(out.sample as object)).toHaveLength(50)
    expect(out.truncated).toBe(true)
  })

  it('drops prototype-polluting keys', () => {
    const parsed = JSON.parse(
      '{"__proto__":{"polluted":1},"constructor":{"prototype":{"x":1}},"prototype":1,"ok":{"__proto__":2,"b":3}}'
    )
    const out = sanitizeSample(parsed) as Record<string, unknown>
    expect(Object.keys(out)).toEqual(['ok'])
    expect(Object.keys(out.ok as object)).toEqual(['b'])
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(JSON.parse(JSON.stringify(out))).toEqual({ ok: { b: 3 } })
  })

  it('turns non-finite numbers and non-JSON values into null', () => {
    expect(
      sanitizeSample({
        a: NaN,
        b: Infinity,
        c: -Infinity,
        d: 1.5,
        e: undefined,
        f: () => 1,
        g: 10n
      })
    ).toEqual({
      a: null,
      b: null,
      c: null,
      d: 1.5,
      e: null,
      f: null,
      g: null
    })
  })

  it('redacts the secret in values and keys', () => {
    const out = JSON.stringify(
      sanitizeSample({ token: `Bearer ${SECRET}`, [SECRET]: 1 }, SECRET)
    )
    expect(out).not.toContain(SECRET)
    expect(out).toContain('[redacted]')
  })

  it('redacts before cutting, so a straddling secret leaves nothing', () => {
    const s = 'p'.repeat(70) + SECRET + 'q'.repeat(40)
    const v = sanitizeSample({ [s]: s }, SECRET) as Record<string, string>
    const [k, val] = Object.entries(v)[0]
    for (const part of [k, val]) {
      expect(part).toHaveLength(80)
      expect(part).not.toContain('sk-very')
      expect(part).not.toContain(SECRET.slice(0, 10))
    }
  })

  it('redacts URL-encoded and base64 copies', () => {
    const secret = 'a b/c+d=e?f&g'
    const b64 = Buffer.from(secret).toString('base64')
    const out = JSON.stringify(
      sanitizeSample(
        {
          enc: `x=${encodeURIComponent(secret)}`,
          b64: `basic ${b64}`,
          url: `basic ${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
        },
        secret
      )
    )
    expect(out).not.toContain(encodeURIComponent(secret))
    expect(out).not.toContain(b64.replace(/=+$/, ''))
    expect(out.match(/\[redacted\]/g)).toHaveLength(3)
  })

  it('caps the serialized size at 64 KB', () => {
    const big: Record<string, unknown> = {}
    for (let i = 0; i < 50; i++) {
      const inner: Record<string, unknown> = {}
      for (let j = 0; j < 50; j++)
        inner[`key-${j}-${'k'.repeat(60)}`] = [
          'é'.repeat(200),
          'v'.repeat(200)
        ]
      big[`group${i}`] = inner
    }
    const out = sanitizeSampleResult(big)
    const size = Buffer.byteLength(JSON.stringify(out.sample), 'utf8')
    expect(size).toBeLessThanOrEqual(65536)
    expect(size).toBeGreaterThan(30000)
    expect(out.truncated).toBe(true)
    expect(Object.keys(out.sample as object)).toHaveLength(50)
  })

  it('never throws on odd input', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => JSON.stringify(sanitizeSample(cyclic))).not.toThrow()
    expect(sanitizeSample(undefined)).toBeNull()
    expect(sanitizeSample('plain')).toBe('plain')
  })
})

const ID = 'abcd1234'

function storeConnector(url: string) {
  mem.store.set('connectors', [
    {
      id: ID,
      label: 'Prices',
      layout: 'number',
      mapping: { value: 'price' },
      intervalMin: 5,
      source: { kind: 'json', url, header: { name: 'X-Key' } }
    }
  ])
  mem.store.set(`connectorSecret.${ID}`, SECRET)
}

describe('fetchSample', () => {
  beforeEach(() => {
    mem.store.clear()
    fetchMock.mockReset()
  })

  it('fetches once and returns the sanitized sample', async () => {
    fetchMock.mockResolvedValue({ items: [1, 2, 3, 4, 5, 6] })
    const out = await fetchSample({
      url: URL_,
      header: { name: 'X-Key', value: SECRET }
    })
    expect(out).toEqual({
      sample: { items: [1, 2, 3, 4, 5] },
      truncated: true
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(URL_)
    expect(fetchMock.mock.calls[0][1].header).toEqual({
      name: 'X-Key',
      value: SECRET
    })
  })

  it('redacts an echoed secret', async () => {
    fetchMock.mockResolvedValue({ echo: SECRET })
    const out = await fetchSample({
      url: URL_,
      header: { name: 'X-Key', value: SECRET }
    })
    expect(JSON.stringify(out)).not.toContain(SECRET)
    expect(out).toEqual({
      sample: { echo: '[redacted]' },
      truncated: false
    })
  })

  it('errors never contain the URL or the secret', async () => {
    fetchMock.mockRejectedValue(new Error(`failed ${URL_} with ${SECRET}`))
    const out = await fetchSample({
      url: URL_,
      header: { name: 'X-Key', value: SECRET }
    })
    expect(out).toEqual({ error: 'Fetch failed' })

    fetchMock.mockRejectedValue(new Error('getaddrinfo api.example.com'))
    const host = await fetchSample({ url: URL_ })
    expect(JSON.stringify(host)).not.toContain('api.example.com')

    fetchMock.mockRejectedValue(new Error('HTTP 500'))
    expect(await fetchSample({ url: URL_ })).toEqual({ error: 'HTTP 500' })
  })

  it('validates the url and header before fetching', async () => {
    expect(await fetchSample({ url: 'ftp://x.test/' })).toEqual({
      error: 'URL must start with http:// or https://'
    })
    const bad = await fetchSample({
      url: URL_,
      header: { name: 'X-Key', value: 'a\nb' }
    })
    expect(bad).toEqual({
      error: 'Header value must not contain control characters'
    })
    expect(
      await fetchSample({
        url: URL_,
        header: { name: 'Cookie', value: 'x' }
      })
    ).toEqual({ error: 'Header "Cookie" is not allowed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reuses the stored secret only on the same origin', async () => {
    storeConnector('https://api.example.com/old')
    fetchMock.mockResolvedValue({ ok: true })

    const same = await fetchSample({
      id: ID,
      url: 'https://api.example.com/new',
      header: { name: 'X-Key' }
    })
    expect(same).toEqual({ sample: { ok: true }, truncated: false })
    expect(fetchMock.mock.calls[0][1].header).toEqual({
      name: 'X-Key',
      value: SECRET
    })

    const other = await fetchSample({
      id: ID,
      url: 'https://evil.example.net/new',
      header: { name: 'X-Key' }
    })
    expect(other).toEqual({
      error: "Enter the header value again when changing the URL's host"
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('needs a value when there is no stored connector', async () => {
    const out = await fetchSample({
      id: 'zzzz9999',
      url: URL_,
      header: { name: 'X-Key' }
    })
    expect(out).toEqual({ error: 'Enter a header value' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
