import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  secure: true
}))

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => mem.secure }
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

import { __setRecipesForTest } from '../mcp/recipes.js'
import {
  startTestMcpServer,
  type TestMcp
} from '../mcp/testServer/index.js'

import {
  ipcListConnectors,
  ipcSaveConnector,
  ipcTestConnector
} from './ipc.js'
import { getConnector, saveConnector, SIGN_IN_FIRST } from './store.js'

const MAPPING = {
  itemsPath: 'tasks',
  primary: 'title',
  secondary: 'due',
  value: 'status'
}

function useRecipes(): void {
  __setRecipesForTest({
    'recipes/demo.json': {
      id: 'demo',
      label: 'Demo',
      description: 'Demo recipe',
      intervalMin: 7,
      tool: { name: 'list_tasks', args: { list: { $setting: 'list' } } },
      settings: [{ key: 'list', label: 'List name', maxLength: 5 }],
      layout: 'list',
      mapping: MAPPING
    }
  })
}

function draft(over: Record<string, unknown> = {}) {
  return {
    kind: 'mcp',
    label: 'Tasks',
    recipeId: 'demo',
    serverUrl: 'https://mcp.example.com/mcp',
    ...over
  }
}

let server: TestMcp | null = null

beforeEach(() => {
  mem.store.clear()
  mem.secure = true
  useRecipes()
})

afterEach(async () => {
  __setRecipesForTest(null)
  await server?.close()
  server = null
})

describe('MCP draft validation', () => {
  it('copies layout, mapping and the default interval from the recipe', () => {
    const c = saveConnector(
      draft({ settings: { list: ' inbox ' } }) as never
    )
    expect(c.layout).toBe('list')
    expect(c.mapping).toEqual(MAPPING)
    expect(c.intervalMin).toBe(7)
    expect(c.source).toMatchObject({
      kind: 'mcp',
      recipeId: 'demo',
      settings: { list: 'inbox' }
    })
    expect(c.id).toMatch(/^[a-z0-9]{8}$/)
  })

  it.each([
    [{ recipeId: 'nope' }, 'Unknown recipe'],
    [{ settings: { other: 'x' } }, 'Unknown setting'],
    [{ settings: { list: 'toolong' } }, 'List name is too long'],
    [{ serverUrl: 'ftp://x' }, 'URL must start with http:// or https://'],
    [{ intervalMin: 0 }, /interval/i],
    [{ clientId: 'bad\u0001id' }, /Client ID/]
  ])('rejects %j', (over, message) => {
    expect(() => saveConnector(draft(over) as never)).toThrow(message)
    expect(ipcListConnectors()).toEqual([])
  })

  it('refuses a kind change in both directions', () => {
    const mcp = saveConnector(draft() as never)
    expect(() =>
      saveConnector({
        id: mcp.id,
        label: 'x',
        layout: 'number',
        mapping: { value: 'a' },
        intervalMin: 5,
        url: 'https://a.example.com/x'
      } as never)
    ).toThrow("A connector can't change type")
    const json = saveConnector({
      label: 'x',
      layout: 'number',
      mapping: { value: 'a' },
      intervalMin: 5,
      url: 'https://a.example.com/x'
    } as never)
    expect(() => saveConnector(draft({ id: json.id }) as never)).toThrow(
      "A connector can't change type"
    )
  })

  it('allows at most 20 connectors', () => {
    for (let i = 0; i < 20; i++) saveConnector(draft() as never)
    expect(() => saveConnector(draft() as never)).toThrow(
      'At most 20 connectors'
    )
  })

  it('clears auth when the server origin changes, not otherwise', () => {
    const c = saveConnector(draft() as never)
    const key = `mcpAuth.${c.id}.tokens`
    mem.store.set(
      key,
      JSON.stringify({
        tokens: { access_token: 'a', token_type: 'Bearer' },
        savedAt: 1
      })
    )
    saveConnector(
      draft({
        id: c.id,
        serverUrl: 'https://mcp.example.com/other'
      }) as never
    )
    expect(mem.store.has(key)).toBe(true)
    saveConnector(
      draft({
        id: c.id,
        serverUrl: 'https://elsewhere.example.org/mcp'
      }) as never
    )
    expect(mem.store.has(key)).toBe(false)
    expect(getConnector(c.id)?.source).toMatchObject({
      serverUrl: 'https://elsewhere.example.org/mcp'
    })
  })

  it('sets, masks, keeps and clears the manual client ID', () => {
    const c = saveConnector(
      draft({ clientId: ' client-abcd1234 ' }) as never
    )
    let s = ipcListConnectors()[0]
    expect(s).toMatchObject({
      clientIdSet: true,
      clientIdHint: '••••1234',
      auth: 'signedOut'
    })
    expect(JSON.stringify(s)).not.toContain('client-abcd')
    saveConnector(draft({ id: c.id, label: 'Renamed' }) as never)
    s = ipcListConnectors()[0]
    expect(s.clientIdSet).toBe(true)
    saveConnector(draft({ id: c.id, clientId: null }) as never)
    s = ipcListConnectors()[0]
    expect(s).toMatchObject({ clientIdSet: false })
    expect(s).not.toHaveProperty('clientIdHint')
  })

  it('rejects a client ID when secure storage is unavailable', () => {
    mem.secure = false
    expect(() =>
      saveConnector(draft({ clientId: 'abc' }) as never)
    ).toThrow('Secure storage unavailable on this system')
    expect(ipcListConnectors()).toEqual([])
    expect(() => saveConnector(draft() as never)).not.toThrow()
  })

  it('ipcSaveConnector rejects with a readable message', () => {
    expect(() => ipcSaveConnector(draft({ recipeId: 'nope' }))).toThrow(
      'Unknown recipe'
    )
  })
})

describe('MCP draft test', () => {
  it('tests an unsaved draft against a server without auth', async () => {
    server = await startTestMcpServer()
    __setRecipesForTest({
      'recipes/demo.json': {
        id: 'demo',
        label: 'Demo',
        description: 'Demo',
        intervalMin: 5,
        tool: { name: 'list_tasks', args: {} },
        settings: [],
        layout: 'list',
        mapping: MAPPING
      }
    })
    const r = await ipcTestConnector(draft({ serverUrl: server.url }))
    expect(r.error).toBeUndefined()
    expect(r.view).toMatchObject({ layout: 'list' })
    expect(ipcListConnectors()).toEqual([])
  })

  it('asks to save and sign in against an auth server', async () => {
    server = await startTestMcpServer({ auth: true })
    const r = await ipcTestConnector(draft({ serverUrl: server.url }))
    expect(r).toEqual({ error: SIGN_IN_FIRST })
    expect(SIGN_IN_FIRST).toBe('Sign-in required: save, then sign in')
  })

  it('never rejects on an invalid draft', async () => {
    expect(await ipcTestConnector(draft({ recipeId: 'nope' }))).toEqual({
      error: 'Unknown recipe'
    })
  })
})
