import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => new Map<string, unknown>())

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
vi.mock('../utils.js', () => ({ log: () => {}, LogLevel: { WARN: 2 } }))
vi.mock('../storage.js', () => ({
  getStorageValue: (key: string) => store.get(key) ?? null,
  setStorageValue: (key: string, value: unknown) => {
    store.set(key, value)
  }
}))

import { FeedKey } from '../feeds/types.js'
import { modules } from './registry.js'
import {
  activeFeedKeys,
  getTabSettings,
  normalizeTabSettings,
  syncFeeds,
  setTabSettings,
  tabsPayload
} from './tabs.js'

const ids = ['a', 'b', 'c']

beforeEach(() => store.clear())

describe('normalizeTabSettings', () => {
  it('falls back to defaults for garbage', () => {
    const defaults = { order: ids, hidden: [] }
    for (const v of [
      null,
      undefined,
      5,
      'x',
      [],
      { order: 3, hidden: 'a' }
    ])
      expect(normalizeTabSettings(v, ids)).toEqual(defaults)
  })

  it('drops unknown ids and duplicates, appends missing ids', () => {
    expect(
      normalizeTabSettings(
        { order: ['c', 'zzz', 'c', 7, 'a'], hidden: ['zzz', 'a', 'a'] },
        ids
      )
    ).toEqual({ order: ['c', 'a', 'b'], hidden: ['a'] })
  })

  it('orders hidden by order', () => {
    expect(
      normalizeTabSettings(
        { order: ['c', 'b', 'a'], hidden: ['a', 'c'] },
        ids
      ).hidden
    ).toEqual(['c', 'a'])
  })

  it('keeps at least one tab on', () => {
    expect(
      normalizeTabSettings({ order: ids, hidden: ['a', 'b', 'c'] }, ids)
        .hidden
    ).toEqual([])
  })
})

describe('get/setTabSettings', () => {
  it('defaults to registry order and stores the normalized value', () => {
    const all = modules.map(m => m.id)
    expect(getTabSettings()).toEqual({ order: all, hidden: [] })
    const saved = setTabSettings({
      order: ['spotify'],
      hidden: ['weather']
    })
    expect(saved.order[0]).toBe('spotify')
    expect(saved.order).toHaveLength(all.length)
    expect(store.get('tabSettings')).toEqual(saved)
    expect(getTabSettings()).toEqual(saved)
  })
})

describe('activeFeedKeys', () => {
  const order = modules.map(m => m.id)
  const keys = (hidden: string[]) =>
    [...activeFeedKeys(modules, { order, hidden })].sort()

  it('has all five feeds when nothing is hidden', () => {
    expect(keys([])).toEqual([
      'calendar',
      'fantasy',
      'sports',
      'todo',
      'weather'
    ])
  })

  it('keeps sports while fantasy is visible', () => {
    expect(keys(['sports'])).toContain('sports')
  })

  it('drops both when both are hidden', () => {
    const k = keys(['sports', 'fantasy'])
    expect(k).not.toContain('sports')
    expect(k).not.toContain('fantasy')
  })

  it('is unchanged when spotify is hidden', () => {
    expect(keys(['spotify'])).toEqual(keys([]))
  })
})

describe('syncFeeds', () => {
  it('starts and stops only what changed', () => {
    const fake = () => ({ start: vi.fn(), stop: vi.fn() })
    const w = fake()
    const s = fake()
    const feeds = new Map<FeedKey, ReturnType<typeof fake>>([
      ['weather', w],
      ['sports', s]
    ])
    let running = syncFeeds(
      feeds,
      new Set(),
      new Set(['weather', 'sports'])
    )
    expect([w.start.mock.calls.length, s.start.mock.calls.length]).toEqual(
      [1, 1]
    )
    running = syncFeeds(feeds, running, new Set(['weather']))
    expect(s.stop).toHaveBeenCalledTimes(1)
    expect(w.stop).not.toHaveBeenCalled()
    expect([...running]).toEqual(['weather'])
    running = syncFeeds(feeds, running, new Set(['weather', 'sports']))
    expect(s.start).toHaveBeenCalledTimes(2)
    expect(w.start).toHaveBeenCalledTimes(1)
    expect(running.size).toBe(2)
  })
})

describe('connector tabs', () => {
  const connector = (id: string, label = 'Price') => ({
    id,
    label,
    layout: 'number',
    mapping: { value: 'price' },
    intervalMin: 5,
    source: {
      kind: 'json',
      url: 'https://example.com/secret-path',
      header: { name: 'X-Key' }
    }
  })
  const staticIds = modules.map(m => m.id)

  it('appends a new connector visible', () => {
    store.set('tabSettings', { order: staticIds, hidden: ['todo'] })
    store.set('connectors', [connector('aaaa1111')])
    expect(getTabSettings()).toEqual({
      order: [...staticIds, 'json:aaaa1111'],
      hidden: ['todo']
    })
  })

  it('drops a deleted connector from order and hidden', () => {
    store.set('tabSettings', {
      order: [...staticIds, 'json:aaaa1111'],
      hidden: ['json:aaaa1111']
    })
    expect(getTabSettings()).toEqual({ order: staticIds, hidden: [] })
  })

  it('unhides the first tab when deleting leaves all hidden', () => {
    store.set('tabSettings', {
      order: ['json:aaaa1111', ...staticIds],
      hidden: staticIds
    })
    store.set('connectors', [connector('aaaa1111')])
    expect(getTabSettings().hidden).toEqual(staticIds)
    store.set('connectors', [])
    expect(getTabSettings()).toEqual({ order: staticIds, hidden: [] })
  })

  it('drops unknown json ids when saving', () => {
    store.set('connectors', [connector('aaaa1111')])
    const saved = setTabSettings({
      order: ['json:zzzz9999', 'json:aaaa1111'],
      hidden: ['json:zzzz9999']
    })
    expect(saved.order[0]).toBe('json:aaaa1111')
    expect(saved.order).not.toContain('json:zzzz9999')
    expect(saved.hidden).toEqual([])
  })

  it('sends only id, label and layout of each connector', () => {
    store.set('connectors', [connector('aaaa1111', 'BTC')])
    const payload = tabsPayload()
    expect(payload.connectors).toEqual([
      { id: 'json:aaaa1111', label: 'BTC', layout: 'number' }
    ])
    const text = JSON.stringify(payload)
    expect(text).not.toContain('example.com')
    expect(text).not.toContain('X-Key')
    expect(text).not.toContain('price')
  })

  it('includes mcp connectors with only id, label and layout', () => {
    store.set('connectors', [
      {
        id: 'bbbb2222',
        label: 'Mail',
        layout: 'number',
        mapping: { value: 'secretpath' },
        intervalMin: 5,
        source: {
          kind: 'mcp',
          recipeId: 'gmail-unread',
          serverUrl: 'https://mcp.example.com/mcp'
        }
      }
    ])
    const payload = tabsPayload()
    expect(payload.connectors).toEqual([
      { id: 'mcp:bbbb2222', label: 'Mail', layout: 'number' }
    ])
    expect(payload.order).toContain('mcp:bbbb2222')
    const text = JSON.stringify(payload)
    expect(text).not.toContain('example.com')
    expect(text).not.toContain('gmail-unread')
    expect(text).not.toContain('secretpath')
  })
})
