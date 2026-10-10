import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  broadcasts: [] as { type: string; data: unknown }[]
}))
const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    getName: () => 'test',
    getAppPath: () => '/',
    getPath: () => '/'
  },
  shell: {},
  ipcMain: {},
  BrowserWindow: class {}
}))
vi.mock('../utils.js', () => ({
  log: () => {},
  LogLevel: { WARN: 2, DEBUG: 0 }
}))
vi.mock('../storage.js', () => ({
  getStorageValue: (key: string) => mem.store.get(key) ?? null,
  setStorageValue: (key: string, value: unknown) => {
    mem.store.set(key, value)
  },
  deleteStorageValue: (key: string) => {
    mem.store.delete(key)
  }
}))
vi.mock('../server.js', () => ({
  serverManager: {
    broadcast: (type: string, data: unknown) =>
      mem.broadcasts.push({ type, data })
  }
}))
vi.mock('./fetch.js', () => ({ fetchConnectorJson: fetchMock }))

import { getFeed } from '../feeds/registry.js'
import { FeedKey } from '../feeds/types.js'
import { findHandler } from '../handlers/handlers.js'
import { modules } from '../modules/registry.js'
import { tabsPayload } from '../modules/tabs.js'
import { setup } from '../setup/feeds.js'
import { deleteConnector, saveConnector } from './store.js'

vi.stubGlobal('__GOOGLE_CLIENT_ID__', '')
vi.stubGlobal('__GOOGLE_CLIENT_SECRET__', '')

const SECRET = 'sk-very-secret-value-123'
const URL1 = 'https://example.com/private/path'

function draft(over: Record<string, unknown> = {}) {
  return {
    label: 'Price',
    layout: 'number',
    mapping: { value: 'price' },
    intervalMin: 5,
    url: URL1,
    header: { name: 'X-Key', value: SECRET },
    ...over
  }
}

const key = (id: string): FeedKey => `json:${id}`
const flush = () => vi.advanceTimersByTimeAsync(0)

let cleanup: () => Promise<void>

beforeEach(async () => {
  vi.useFakeTimers()
  mem.store.clear()
  mem.broadcasts.length = 0
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ price: 42 })
  // Only connectors run; the static apps stay hidden.
  mem.store.set('tabSettings', {
    order: modules.map(m => m.id),
    hidden: modules.slice(0, -1).map(m => m.id)
  })
  cleanup = (await setup()) as () => Promise<void>
})

afterEach(async () => {
  await cleanup()
  vi.useRealTimers()
})

describe('connector runtime', () => {
  it('add registers the feed, handler and tab, and fetches', async () => {
    const { id } = saveConnector(draft())
    await flush()

    expect(getFeed(key(id))).not.toBeNull()
    expect(findHandler(key(id))?.name).toBe(key(id))
    expect(tabsPayload().order).toContain(key(id))
    expect(tabsPayload().connectors).toEqual([
      { id: key(id), label: 'Price', layout: 'number' }
    ])
    expect(fetchMock).toHaveBeenCalledWith(URL1, {
      header: { name: 'X-Key', value: SECRET }
    })
    const payload = getFeed(key(id))?.getPayload()
    expect(payload?.items).toEqual([{ layout: 'number', value: '42' }])
    expect(mem.broadcasts.some(b => b.type === 'tabs')).toBe(true)
  })

  it('edit replaces the feed with the new interval and label', async () => {
    const { id } = saveConnector(draft())
    await flush()
    const first = getFeed(key(id))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    saveConnector({
      ...draft({
        id,
        label: 'Renamed',
        intervalMin: 10,
        url: 'https://example.com/other'
      }),
      header: undefined
    })
    await flush()
    expect(getFeed(key(id))).not.toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/other')
    expect(tabsPayload().connectors[0].label).toBe('Renamed')

    await vi.advanceTimersByTimeAsync(9 * 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('edit drops cached data when the url changed', async () => {
    const { id } = saveConnector(draft())
    await flush()
    expect(mem.store.get(`feedCache.${key(id)}`)).toBeTruthy()
    fetchMock.mockImplementation(() => new Promise(() => {}))
    saveConnector({
      ...draft({ id, url: 'https://example.com/x' }),
      header: undefined
    })
    await flush()
    expect(mem.store.has(`feedCache.${key(id)}`)).toBe(false)
    expect(getFeed(key(id))?.getPayload().items).toEqual([])
  })

  it('delete removes the feed, cache, handler and tab', async () => {
    const { id } = saveConnector(draft())
    await flush()
    expect(mem.store.has(`feedCache.${key(id)}`)).toBe(true)

    deleteConnector(id)
    await flush()
    expect(getFeed(key(id))).toBeNull()
    expect(mem.store.has(`feedCache.${key(id)}`)).toBe(false)
    expect(findHandler(key(id))).toBeUndefined()
    expect(tabsPayload().order).not.toContain(key(id))
    expect(tabsPayload().connectors).toEqual([])

    fetchMock.mockClear()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never puts the url or secret in broadcasts or the tabs payload', async () => {
    saveConnector(draft())
    await flush()
    const text = JSON.stringify([mem.broadcasts, tabsPayload()])
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain('example.com')
    expect(text).not.toContain('private')
    expect(text).not.toContain('X-Key')
  })

  it('a failed fetch makes the feed stale with the readable message', async () => {
    fetchMock.mockRejectedValue(new Error('Connection refused'))
    const { id } = saveConnector(draft())
    await flush()
    const payload = getFeed(key(id))?.getPayload()
    expect(payload?.stale).toBe(true)
    expect(payload?.error).toBe('Connection refused')
    expect(JSON.stringify(mem.broadcasts)).not.toContain(SECRET)
  })

  it('delete while a fetch is pending writes no cache and broadcasts nothing', async () => {
    let resolve: (v: unknown) => void = () => {}
    fetchMock.mockImplementation(() => new Promise(r => (resolve = r)))
    const { id } = saveConnector(draft())
    await flush()
    deleteConnector(id)
    await flush()
    mem.broadcasts.length = 0
    resolve({ price: 1 })
    await flush()
    expect(mem.store.has(`feedCache.${key(id)}`)).toBe(false)
    expect(mem.broadcasts.filter(b => b.type === key(id))).toEqual([])
  })

  it('edit while a fetch is pending drops the old result', async () => {
    const resolvers: ((v: unknown) => void)[] = []
    fetchMock.mockImplementation(() => new Promise(r => resolvers.push(r)))
    const { id } = saveConnector(draft())
    await flush()
    saveConnector({
      ...draft({ id, url: 'https://example.com/other' }),
      header: undefined
    })
    await flush()
    expect(resolvers).toHaveLength(2)
    mem.broadcasts.length = 0
    resolvers[0]({ price: 1 })
    await flush()
    expect(mem.broadcasts.filter(b => b.type === key(id))).toEqual([])
    expect(getFeed(key(id))?.getPayload().items).toEqual([])
    resolvers[1]({ price: 2 })
    await flush()
    expect(getFeed(key(id))?.getPayload().items).toEqual([
      { layout: 'number', value: '2' }
    ])
  })

  it('a response echoing the secret errors and publishes nothing with it', async () => {
    fetchMock.mockResolvedValue({ echo: SECRET })
    const { id } = saveConnector(
      draft({
        layout: 'keyvalue',
        mapping: { pairs: [{ label: 'Echo', path: 'echo' }] }
      })
    )
    await flush()
    const payload = getFeed(key(id))?.getPayload()
    expect(payload?.stale).toBe(true)
    expect(payload?.error).toBe(
      'Response contains the secret header value'
    )
    expect(payload?.items).toEqual([])
    expect(
      JSON.stringify(
        [...mem.store.entries()].filter(
          ([k]) => k !== `connectorSecret.${id}`
        )
      )
    ).not.toContain(SECRET)
    expect(JSON.stringify(mem.broadcasts)).not.toContain(SECRET)
  })
})
