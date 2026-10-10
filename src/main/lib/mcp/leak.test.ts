// Tokens never leave the host: nothing a renderer or the device can receive
// may contain an access/refresh token, the PKCE verifier or the DCR client id.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  // What shell.openExternal does: drives the test auth server.
  open: (async () => {}) as (url: string) => Promise<void>
}))

vi.mock('electron', () => ({
  app: {
    getName: () => 'test',
    getAppPath: () => '/',
    getPath: () => '/'
  },
  shell: { openExternal: (url: string) => mem.open(url) },
  ipcMain: {},
  BrowserWindow: class {},
  safeStorage: { isEncryptionAvailable: () => true }
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
  serverManager: { broadcast: () => {} }
}))

import { ipcListConnectors, ipcTestConnector } from '../connectors/ipc.js'
import { setMcpRunner } from '../connectors/mcpHook.js'
import { connectorManifest } from '../connectors/modules.js'
import {
  isProtectedStorageKey,
  saveConnector
} from '../connectors/store.js'
import { Feed } from '../feeds/Feed.js'
import { tabsPayload } from '../modules/tabs.js'

import { readClient, readTokens, readVerifier } from './auth/store.js'
import { signIn } from './auth/signIn.js'
import { runMcp } from './client.js'
import { ipcListMcpRecipes, ipcMcpSignIn } from './ipc.js'
import { __setRecipesForTest } from './recipes.js'
import { startTestMcpServer, type TestMcp } from './testServer/index.js'

vi.stubGlobal('__GOOGLE_CLIENT_ID__', '')
vi.stubGlobal('__GOOGLE_CLIENT_SECRET__', '')

let server: TestMcp | null = null

beforeEach(() => {
  mem.store.clear()
  __setRecipesForTest({
    'recipes/leak.json': {
      id: 'leak',
      label: 'Leak',
      description: 'Leak test',
      intervalMin: 5,
      tool: { name: 'list_tasks', args: {} },
      settings: [],
      layout: 'list',
      mapping: {
        itemsPath: 'tasks',
        primary: 'title',
        secondary: 'due',
        value: 'status'
      }
    }
  })
})

afterEach(async () => {
  __setRecipesForTest(null)
  setMcpRunner(null)
  await server?.close()
  server = null
})

describe('tokens never leave the host', () => {
  it('keeps every secret out of IPC responses, tabs and feed payloads', async () => {
    server = await startTestMcpServer({ auth: true })
    const s = server
    const c = saveConnector({
      kind: 'mcp',
      label: 'Leak',
      recipeId: 'leak',
      serverUrl: s.url
    } as never)

    mem.open = async url => {
      await s.auth!.authorizeVia(url)
    }
    let verifier: string | null = null
    const r = await signIn(c.id, {
      openExternal: async url => {
        verifier = readVerifier(c.id)
        await s.auth!.authorizeVia(url)
      }
    })
    expect(r).toEqual({ ok: true })

    const tokens = readTokens(c.id)?.tokens
    const secrets = [
      tokens?.access_token,
      tokens?.refresh_token,
      verifier,
      readClient(c.id).info?.client_id
    ].filter((x): x is string => typeof x === 'string' && x.length > 0)
    expect(secrets.length).toBeGreaterThanOrEqual(3)

    const outputs: unknown[] = [
      ipcListConnectors(),
      ipcListMcpRecipes(),
      await ipcMcpSignIn(c.id),
      await ipcTestConnector({
        id: c.id,
        kind: 'mcp',
        label: 'Leak',
        recipeId: 'leak',
        serverUrl: s.url
      }),
      await ipcTestConnector({
        kind: 'mcp',
        label: 'Leak',
        recipeId: 'leak',
        serverUrl: s.url
      }),
      tabsPayload()
    ]

    setMcpRunner(x => runMcp(x))
    const [source] = connectorManifest(c).feeds()
    const feed = new Feed(source, {
      now: () => Date.now(),
      formatTime: () => '',
      loadCache: () => null,
      saveCache: () => {},
      publish: () => {}
    })
    await feed.refresh()
    const payload = feed.getPayload()
    expect(payload.items).toHaveLength(1)
    outputs.push(payload)

    // The extra sign-in above re-registered and re-issued tokens.
    const later = readTokens(c.id)?.tokens
    secrets.push(
      ...[
        later?.access_token,
        later?.refresh_token,
        readClient(c.id).info?.client_id
      ].filter((x): x is string => typeof x === 'string' && x.length > 0)
    )
    for (const out of outputs) {
      const text = JSON.stringify(out)
      for (const secret of secrets) expect(text).not.toContain(secret)
    }
  })

  it('the generic storage IPC guard refuses auth keys', () => {
    for (const part of ['tokens', 'client', 'verifier'])
      expect(isProtectedStorageKey(`mcpAuth.abcd1234.${part}`)).toBe(true)
  })
})
