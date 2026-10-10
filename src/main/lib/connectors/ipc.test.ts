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

import {
  ipcDeleteConnector,
  ipcListConnectors,
  ipcSaveConnector,
  ipcTestConnector
} from './ipc.js'
import { getConnectorSecret } from './store.js'

const SECRET = 'sk-very-secret-value-123'

function draft(over: Record<string, unknown> = {}) {
  return {
    label: 'Prices',
    layout: 'number',
    mapping: { value: 'price' },
    intervalMin: 5,
    url: 'https://api.example.com/price',
    ...over
  }
}

const responses: unknown[] = []
function record<T>(value: T): T {
  responses.push(value)
  return value
}

function expectNoSecret() {
  for (const r of responses)
    expect(JSON.stringify(r)).not.toContain(SECRET)
}

beforeEach(() => {
  mem.store.clear()
  responses.length = 0
  fetchMock.mockReset()
})

describe('connector IPC', () => {
  it('save, list and test never return the header value', async () => {
    const c = record(
      ipcSaveConnector(
        draft({ header: { name: 'X-Api-Key', value: SECRET } })
      )
    )
    expect(c.source.header).toEqual({ name: 'X-Api-Key' })
    expect(c.headerSet).toBe(true)
    const list = record(ipcListConnectors())
    expect(list).toEqual([c])

    fetchMock.mockResolvedValue({ price: 42 })
    const ok = record(await ipcTestConnector(draft({ id: c.id })))
    expect(ok).toEqual({ view: { layout: 'number', value: '42' } })
    expect(fetchMock.mock.calls[0][1]).toEqual({
      header: { name: 'X-Api-Key', value: SECRET }
    })

    fetchMock.mockResolvedValue({ price: SECRET })
    record(await ipcTestConnector(draft({ id: c.id })))

    fetchMock.mockRejectedValue(new Error(`boom ${SECRET}`))
    const failed = record(await ipcTestConnector(draft({ id: c.id })))
    expect(failed.error).toBeTruthy()

    expectNoSecret()
  })

  it('header keep, rename, replace and clear', () => {
    const c = ipcSaveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )

    const kept = record(
      ipcSaveConnector(draft({ id: c.id, label: 'Kept' }))
    )
    expect(kept.source.header).toEqual({ name: 'X-Api-Key' })
    expect(kept.headerSet).toBe(true)
    expect(getConnectorSecret(c.id)).toBe(SECRET)

    const renamed = record(
      ipcSaveConnector(draft({ id: c.id, header: { name: 'X-Token' } }))
    )
    expect(renamed.source.header).toEqual({ name: 'X-Token' })
    expect(getConnectorSecret(c.id)).toBe(SECRET)

    const replaced = record(
      ipcSaveConnector(
        draft({
          id: c.id,
          header: { name: 'Authorization', value: 'new' }
        })
      )
    )
    expect(replaced.source.header).toEqual({ name: 'Authorization' })
    expect(getConnectorSecret(c.id)).toBe('new')

    const cleared = record(
      ipcSaveConnector(draft({ id: c.id, header: null }))
    )
    expect(cleared.source.header).toBeUndefined()
    expect(cleared.headerSet).toBe(false)
    expect(getConnectorSecret(c.id)).toBeNull()
    expect(record(ipcListConnectors())[0].headerSet).toBe(false)

    expectNoSecret()
  })

  it('save rejects with a readable message that never echoes the secret', () => {
    expect(() => ipcSaveConnector(draft({ label: '' }))).toThrow(
      'Name is required'
    )
    expect(() =>
      ipcSaveConnector(
        draft({
          mapping: { value: `a..${SECRET}` },
          header: { name: 'X-Key', value: SECRET }
        })
      )
    ).toThrow(/^(?!.*sk-very-secret).*$/)
    expect(ipcListConnectors()).toEqual([])
  })

  it('test returns an error for an invalid draft and a fetch failure', async () => {
    expect(await ipcTestConnector(draft({ url: 'ftp://x' }))).toEqual({
      error: 'URL must start with http:// or https://'
    })
    expect(await ipcTestConnector(null)).toEqual({
      error: 'Invalid connector'
    })
    expect(fetchMock).not.toHaveBeenCalled()

    fetchMock.mockRejectedValue(new Error('Request failed (500)'))
    expect(await ipcTestConnector(draft())).toEqual({
      error: 'Request failed (500)'
    })
  })

  it('delete then list', () => {
    const a = ipcSaveConnector(
      draft({ header: { name: 'X-Api-Key', value: SECRET } })
    )
    const b = ipcSaveConnector(draft({ label: 'Other' }))
    expect(ipcDeleteConnector(a.id)).toBe(true)
    expect(getConnectorSecret(a.id)).toBeNull()
    expect(ipcListConnectors().map(c => c.id)).toEqual([b.id])
    expect(ipcDeleteConnector(a.id)).toBe(false)
    expect(ipcDeleteConnector(42)).toBe(false)
  })
})
