import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  secureSets: [] as { key: string; secure: boolean }[]
}))

vi.mock('../storage.js', () => ({
  getStorageValue: (key: string) => mem.store.get(key) ?? null,
  setStorageValue: (key: string, value: unknown, secure = false) => {
    mem.secureSets.push({ key, secure })
    mem.store.set(key, value)
  },
  deleteStorageValue: (key: string) => {
    mem.store.delete(key)
  }
}))

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('./fetch.js', () => ({ fetchConnectorJson: fetchMock }))

import {
  bumpConnectorRevision,
  connectorRevision,
  deleteConnector,
  getConnector,
  getConnectorSecret,
  isProtectedStorageKey,
  listConnectors,
  listConnectorsForSettings,
  onConnectorsChanged,
  saveConnector,
  testDraft
} from './store.js'

import type { JsonSource } from './types.js'

const SECRET = 'sk-very-secret-value-123'

function draft(over: Record<string, unknown> = {}) {
  return {
    label: 'Prices',
    layout: 'number',
    mapping: { value: 'price' },
    intervalMin: 5,
    url: 'https://api.example.com/price',
    ...over
  } as Parameters<typeof saveConnector>[0]
}

beforeEach(() => {
  mem.store.clear()
  mem.secureSets.length = 0
  fetchMock.mockReset()
})

describe('saveConnector', () => {
  it('creates with an 8-char id and no header', () => {
    const c = saveConnector(draft())
    expect(c.id).toMatch(/^[a-z0-9]{8}$/)
    expect(c.source).toEqual({
      kind: 'json',
      url: 'https://api.example.com/price'
    })
    expect(listConnectors()).toEqual([c])
  })

  it('edit keeps the id and renames', () => {
    const c = saveConnector(draft())
    const e = saveConnector(draft({ id: c.id, label: 'Renamed' }))
    expect(e.id).toBe(c.id)
    expect(listConnectors()).toHaveLength(1)
    expect(getConnector(c.id)?.label).toBe('Renamed')
  })

  it('rejects an unknown id', () => {
    expect(() => saveConnector(draft({ id: 'zzzzzzzz' }))).toThrow(
      'Connector not found'
    )
  })

  it('stores the secret securely and never in the list', () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    expect(mem.secureSets).toContainEqual({
      key: `connectorSecret.${c.id}`,
      secure: true
    })
    expect(mem.store.get(`connectorSecret.${c.id}`)).toBe(SECRET)
    expect(getConnectorSecret(c.id)).toBe(SECRET)
    expect(JSON.stringify(mem.store.get('connectors'))).not.toContain(
      SECRET
    )
    expect(JSON.stringify(listConnectors())).not.toContain(SECRET)
    const forSettings = listConnectorsForSettings()
    expect(JSON.stringify(forSettings)).not.toContain(SECRET)
    expect(forSettings[0].headerSet).toBe(true)
    expect((forSettings[0].source as JsonSource).header).toEqual({
      name: 'X-Api-Key'
    })
  })

  it('header undefined keeps name and secret', () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    saveConnector(draft({ id: c.id, label: 'Other' }))
    expect((getConnector(c.id)?.source as JsonSource).header).toEqual({
      name: 'X-Api-Key'
    })
    expect(getConnectorSecret(c.id)).toBe(SECRET)
  })

  it('header null clears name and secret', () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    saveConnector(draft({ id: c.id, header: null }))
    expect(
      (getConnector(c.id)?.source as JsonSource).header
    ).toBeUndefined()
    expect(mem.store.has(`connectorSecret.${c.id}`)).toBe(false)
    expect(listConnectorsForSettings()[0].headerSet).toBe(false)
  })

  it('header {name, value} replaces both', () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    saveConnector(
      draft({ id: c.id, header: { name: 'Authorization', value: 'new' } })
    )
    expect((getConnector(c.id)?.source as JsonSource).header).toEqual({
      name: 'Authorization'
    })
    expect(getConnectorSecret(c.id)).toBe('new')
  })

  it('header {name} renames and keeps the stored secret', () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    saveConnector(draft({ id: c.id, header: { name: 'X-Token' } }))
    expect((getConnector(c.id)?.source as JsonSource).header).toEqual({
      name: 'X-Token'
    })
    expect(getConnectorSecret(c.id)).toBe(SECRET)
  })

  it('header {name} without a stored secret asks for a value', () => {
    expect(() =>
      saveConnector(draft({ header: { name: 'X-Token' } }))
    ).toThrow('Enter a header value')
    const c = saveConnector(draft())
    expect(() =>
      saveConnector(draft({ id: c.id, header: { name: 'X-Token' } }))
    ).toThrow('Enter a header value')
  })

  it('a kept secret cannot follow the URL to another origin', () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    const msg = "Enter the header value again when changing the URL's host"
    const url = 'https://evil.example.net/price'
    expect(() => saveConnector(draft({ id: c.id, url }))).toThrow(msg)
    expect(() =>
      saveConnector(draft({ id: c.id, url, header: { name: 'X-B' } }))
    ).toThrow(msg)
    expect((getConnector(c.id)?.source as JsonSource).url).toBe(
      'https://api.example.com/price'
    )
    // A new value, or clearing the header, may move it.
    saveConnector(
      draft({ id: c.id, url, header: { name: 'X-B', value: 'v2' } })
    )
    expect(getConnectorSecret(c.id)).toBe('v2')
    // Same origin with a new path keeps the secret.
    saveConnector(
      draft({ id: c.id, url: 'https://evil.example.net/v2?q=1' })
    )
    expect(getConnectorSecret(c.id)).toBe('v2')
    saveConnector(
      draft({ id: c.id, url: 'https://other.example.org/', header: null })
    )
    expect(getConnectorSecret(c.id)).toBeNull()
  })

  it('allows at most 20 connectors', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 20; i++) ids.add(saveConnector(draft()).id)
    expect(ids.size).toBe(20)
    expect(() => saveConnector(draft())).toThrow('At most 20 connectors')
    // Editing still works at the limit.
    const [first] = ids
    expect(saveConnector(draft({ id: first, label: 'Edit' })).id).toBe(
      first
    )
  })

  it('gives readable validation errors and stores nothing', () => {
    expect(() => saveConnector(draft({ label: '' }))).toThrow(
      'Name is required'
    )
    expect(() => saveConnector(draft({ url: 'ftp://x.example' }))).toThrow(
      'URL must start with http:// or https://'
    )
    expect(() =>
      saveConnector(draft({ url: 'https://user:pw@x.example/' }))
    ).toThrow('URL must not contain a username or password')
    expect(() => saveConnector(draft({ intervalMin: 0 }))).toThrow(
      /Interval/
    )
    expect(() => saveConnector(draft({ layout: 'pie' }))).toThrow(
      'Unknown layout'
    )
    expect(() =>
      saveConnector(draft({ header: { name: 'Host', value: 'x' } }))
    ).toThrow('Header "Host" is not allowed')
    expect(() =>
      saveConnector(draft({ header: { name: 'X-A', value: 'a\nb' } }))
    ).toThrow('Header value must not contain control characters')
    expect(mem.store.size).toBe(0)
  })
})

describe('deleteConnector', () => {
  it('removes the entry and its secret', () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    expect(deleteConnector(c.id)).toBe(true)
    expect(listConnectors()).toEqual([])
    expect(mem.store.has(`connectorSecret.${c.id}`)).toBe(false)
    expect(deleteConnector(c.id)).toBe(false)
  })
})

describe('listConnectors', () => {
  it('drops malformed stored entries without throwing', () => {
    const good = saveConnector(draft())
    const stored = mem.store.get('connectors') as unknown[]
    mem.store.set('connectors', [
      ...stored,
      null,
      'junk',
      { ...good },
      { ...good, id: 'BAD' },
      { ...good, id: 'abcdefgh', layout: 'pie' },
      {
        ...good,
        id: 'abcdefgi',
        source: { kind: 'json', url: 'ftp://x' }
      },
      { ...good, id: 'abcdefgj', intervalMin: 'x' }
    ])
    expect(listConnectors()).toEqual([good])
    mem.store.set('connectors', { not: 'an array' })
    expect(listConnectors()).toEqual([])
  })
})

describe('onConnectorsChanged', () => {
  it('fires after save and delete with the new list', () => {
    const fn = vi.fn()
    const off = onConnectorsChanged(fn)
    const c = saveConnector(draft())
    expect(fn).toHaveBeenLastCalledWith([c])
    deleteConnector(c.id)
    expect(fn).toHaveBeenLastCalledWith([])
    off()
    saveConnector(draft())
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('testDraft', () => {
  it('uses the stored secret when the draft has no value', async () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    fetchMock.mockResolvedValue({ price: 42 })
    const res = await testDraft(draft({ id: c.id }))
    expect(res).toEqual({ view: { layout: 'number', value: '42' } })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/price',
      {
        header: { name: 'X-Api-Key', value: SECRET }
      }
    )
    expect(JSON.stringify(res)).not.toContain(SECRET)
  })

  it("uses the draft's new value over the stored one", async () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    fetchMock.mockResolvedValue({ price: 1 })
    await testDraft(
      draft({ id: c.id, header: { name: 'X-B', value: 'v2' } })
    )
    expect(fetchMock.mock.calls[0][1]).toEqual({
      header: { name: 'X-B', value: 'v2' }
    })
    // Testing never saves.
    expect(getConnectorSecret(c.id)).toBe(SECRET)
  })

  it('returns {error} on fetch failure', async () => {
    fetchMock.mockRejectedValue(new Error('HTTP 401'))
    const res = await testDraft(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    expect(res).toEqual({ error: 'HTTP 401' })
  })

  it('returns {error} on an invalid mapping without fetching', async () => {
    const res = await testDraft(draft({ mapping: { value: '' } }))
    expect(res.error).toMatch(/Value/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns {error} when the data does not fit the mapping', async () => {
    fetchMock.mockResolvedValue({ nope: 1 })
    const res = await testDraft(
      draft({
        layout: 'list',
        mapping: { itemsPath: 'items', primary: 'name' }
      })
    )
    expect(res.error).toBeTruthy()
    expect(res.view).toBeUndefined()
  })

  it('never returns the secret, even when echoed', async () => {
    fetchMock.mockResolvedValue({ echo: SECRET })
    const res = await testDraft(
      draft({
        layout: 'keyvalue',
        mapping: { pairs: [{ label: 'Echo', path: 'echo' }] },
        header: { name: 'X-Api-Key', value: SECRET }
      })
    )
    expect(res.error).toBeTruthy()
    expect(JSON.stringify(res)).not.toContain(SECRET)

    fetchMock.mockRejectedValue(new Error(`bad ${SECRET}`))
    const res2 = await testDraft(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    expect(JSON.stringify(res2)).not.toContain(SECRET)
  })

  it('refuses the stored secret for a URL on another origin', async () => {
    const c = saveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    fetchMock.mockResolvedValue({ price: 1 })
    const msg = "Enter the header value again when changing the URL's host"
    for (const url of [
      'https://evil.example.net/price',
      'http://api.example.com/price',
      'https://api.example.com:8443/price'
    ]) {
      expect(await testDraft(draft({ id: c.id, url }))).toEqual({
        error: msg
      })
      expect(
        await testDraft(
          draft({ id: c.id, url, header: { name: 'X-Api-Key' } })
        )
      ).toEqual({ error: msg })
    }
    expect(fetchMock).not.toHaveBeenCalled()
    // Same origin, new path and query: the stored secret is still used.
    await testDraft(
      draft({ id: c.id, url: 'https://api.example.com/v2?x=1' })
    )
    expect(fetchMock.mock.calls[0][1]).toEqual({
      header: { name: 'X-Api-Key', value: SECRET }
    })
  })

  it('reports an unknown id', async () => {
    expect(await testDraft(draft({ id: 'zzzzzzzz' }))).toEqual({
      error: 'Connector not found'
    })
  })
})

describe('isProtectedStorageKey', () => {
  it('protects the list and secrets only', () => {
    expect(isProtectedStorageKey('connectors')).toBe(true)
    expect(isProtectedStorageKey('connectorSecret.abcd1234')).toBe(true)
    expect(isProtectedStorageKey('connectorSecret.')).toBe(true)
    expect(isProtectedStorageKey('weatherUnits')).toBe(false)
    expect(isProtectedStorageKey('connectorsX')).toBe(false)
  })
})

const MCP_BASE = {
  label: 'Mail',
  layout: 'number',
  mapping: { value: 'n' },
  intervalMin: 5
}
function mcpEntry(source: Record<string, unknown>, id = 'abcd1234') {
  return {
    id,
    ...MCP_BASE,
    source: {
      kind: 'mcp',
      recipeId: 'gmail-unread',
      serverUrl: 'https://mcp.example.com/mcp',
      ...source
    }
  }
}

describe('mcp connectors', () => {
  it('round-trips through parseStored', () => {
    const e = mcpEntry({ settings: { query: 'is:unread' } })
    mem.store.set('connectors', [e])
    expect(listConnectors()).toEqual([e])
    const s = listConnectorsForSettings()[0]
    expect(s.headerSet).toBe(false)
  })

  it('rejects bad recipeId, serverUrl and settings', () => {
    mem.store.set('connectors', [
      mcpEntry({ recipeId: 'Bad_ID' }, 'aaaaaaa1'),
      mcpEntry({ recipeId: '' }, 'aaaaaaa2'),
      mcpEntry({ serverUrl: 'ftp://x' }, 'aaaaaaa3'),
      mcpEntry({ serverUrl: 'https://u:p@x.com/' }, 'aaaaaaa4'),
      mcpEntry({ settings: { '1a': 'x' } }, 'aaaaaaa5'),
      mcpEntry({ settings: { a: 'x'.repeat(201) } }, 'aaaaaaa6'),
      mcpEntry({ settings: { a: 1 } }, 'aaaaaaa7'),
      mcpEntry(
        { settings: { a: '', b: '', c: '', d: '', e: '', f: '' } },
        'aaaaaaa8'
      )
    ])
    expect(listConnectors()).toEqual([])
  })

  it('protects mcpAuth keys', () => {
    expect(isProtectedStorageKey('mcpAuth.x.tokens')).toBe(true)
  })

  it('delete removes the mcpAuth keys', () => {
    mem.store.set('connectors', [mcpEntry({})])
    for (const p of ['tokens', 'client', 'verifier'])
      mem.store.set(`mcpAuth.abcd1234.${p}`, 'v')
    expect(deleteConnector('abcd1234')).toBe(true)
    for (const p of ['tokens', 'client', 'verifier'])
      expect(mem.store.has(`mcpAuth.abcd1234.${p}`)).toBe(false)
  })

  it('bumpConnectorRevision increments and fires listeners', () => {
    const fn = vi.fn()
    const off = onConnectorsChanged(fn)
    expect(connectorRevision('zzzzzzzz')).toBe(0)
    bumpConnectorRevision('zzzzzzzz')
    expect(connectorRevision('zzzzzzzz')).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
    off()
  })
})
