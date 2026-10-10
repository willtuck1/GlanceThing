import { describe, expect, it, vi } from 'vitest'

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
  getStorageValue: () => null,
  setStorageValue: () => {}
}))

import { coreHandlers, getHandlers } from '../handlers/handlers.js'
import { findHandler } from '../handlers/handlers.js'
import { allModules, getModule, modules } from './registry.js'

describe('module registry', () => {
  it('lists unique ids in the default tab order', () => {
    expect(modules.map(m => m.id)).toEqual([
      'weather',
      'calendar',
      'todo',
      'sports',
      'fantasy',
      'spotify'
    ])
    expect(getModule('sports')?.label).toBe('Sports')
    expect(getModule('nope')).toBeUndefined()
  })

  it('has unique handler names across core and module handlers', () => {
    const handlers = getHandlers()
    const names = handlers.map(h => h.name)
    expect(new Set(names).size).toBe(names.length)
    expect(handlers.length).toBeGreaterThan(coreHandlers.length)
  })

  it('only depends on registered modules', () => {
    const ids = modules.map(m => m.id)
    for (const m of modules)
      for (const dep of m.dependsOn ?? []) expect(ids).toContain(dep)
  })

  it('declares feed keys that match its feeds', () => {
    for (const m of modules)
      expect(m.feedKeys).toEqual(m.feeds().map(f => f.key))
    const all = modules.flatMap(m => m.feedKeys)
    expect(new Set(all).size).toBe(all.length)
  })

  it('lists only static modules when there are no connectors', () => {
    expect(allModules().map(m => m.id)).toEqual(modules.map(m => m.id))
  })

  it('finds core and module handlers, but no json handler without a connector', () => {
    expect(findHandler('tabs')?.name).toBe('tabs')
    expect(findHandler('weather')?.name).toBe('weather')
    expect(findHandler('json:abcd1234')).toBeUndefined()
    expect(getHandlers().some(h => h.name.startsWith('json:'))).toBe(false)
    expect(findHandler('mcp:abcd1234')).toBeUndefined()
    expect(getHandlers().some(h => h.name.startsWith('mcp:'))).toBe(false)
  })
})
