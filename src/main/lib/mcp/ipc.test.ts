import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({ store: new Map<string, unknown>() }))

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => true }
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

import { ipcListMcpRecipes, ipcMcpSignIn, ipcMcpSignOut } from './ipc.js'
import { authState } from './auth/store.js'
import { __setRecipesForTest } from './recipes.js'

const ID = 'abcd1234'

beforeEach(() => {
  mem.store.clear()
  __setRecipesForTest({
    'recipes/a.json': {
      id: 'a',
      label: 'A',
      description: 'Tool one',
      defaultServerUrl: 'https://mcp.example.com/mcp',
      intervalMin: 5,
      tool: { name: 'secret_tool', args: { token: 'arg-value' } },
      settings: [
        { key: 'list', label: 'List', placeholder: 'inbox', maxLength: 20 }
      ],
      layout: 'number',
      mapping: { value: 'internalPath' }
    },
    'recipes/b.json': {
      id: 'b',
      label: 'B',
      description: 'Resource one',
      intervalMin: 10,
      resource: { uri: 'file:///x' },
      settings: [],
      layout: 'list',
      mapping: { itemsPath: 'x', primary: 'y' }
    }
  })
})

describe('listMcpRecipes', () => {
  it('returns only display fields', () => {
    const list = ipcListMcpRecipes()
    expect(list).toEqual([
      {
        id: 'a',
        label: 'A',
        description: 'Tool one',
        defaultServerUrl: 'https://mcp.example.com/mcp',
        layout: 'number',
        source: 'tool',
        settings: [
          {
            key: 'list',
            label: 'List',
            placeholder: 'inbox',
            maxLength: 20
          }
        ],
        intervalMin: 5
      },
      {
        id: 'b',
        label: 'B',
        description: 'Resource one',
        layout: 'list',
        source: 'resource',
        settings: [],
        intervalMin: 10
      }
    ])
    const text = JSON.stringify(list)
    for (const hidden of [
      'secret_tool',
      'arg-value',
      'internalPath',
      'file:///x'
    ])
      expect(text).not.toContain(hidden)
  })
})

describe('mcpSignOut / mcpSignIn', () => {
  it('signs out a signed-in connector', () => {
    mem.store.set('connectors', [
      {
        id: ID,
        label: 'A',
        layout: 'number',
        mapping: { value: 'v' },
        intervalMin: 5,
        source: {
          kind: 'mcp',
          recipeId: 'a',
          serverUrl: 'https://mcp.example.com/mcp'
        }
      }
    ])
    mem.store.set(
      `mcpAuth.${ID}.tokens`,
      JSON.stringify({
        tokens: { access_token: 'a', token_type: 'Bearer' },
        savedAt: Date.now()
      })
    )
    expect(authState(ID)).toBe('signedIn')
    expect(ipcMcpSignOut(ID)).toBe(true)
    expect(authState(ID)).toBe('signedOut')
  })

  it('returns false for bad ids and never throws', () => {
    expect(ipcMcpSignOut(42)).toBe(false)
    expect(ipcMcpSignOut('nope')).toBe(false)
  })

  it('sign-in resolves with an error for an unknown connector', async () => {
    expect(await ipcMcpSignIn('abcd1234')).toEqual({
      error: 'Connector not found'
    })
    expect(await ipcMcpSignIn(undefined)).toEqual({
      error: 'Connector not found'
    })
  })
})
