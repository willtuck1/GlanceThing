import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({
  store: new Map<string, unknown>()
}))

vi.mock('electron', () => ({
  app: {
    getName: () => 'test',
    getAppPath: () => '/',
    getPath: () => '/'
  },
  shell: { openExternal: vi.fn() },
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

import { setMcpRunner } from '../connectors/mcpHook.js'
import { connectorManifest } from '../connectors/modules.js'
import { Connector } from '../connectors/types.js'
import { Feed } from '../feeds/Feed.js'

import { signIn } from './auth/signIn.js'
import { readTokens } from './auth/store.js'
import {
  assertNoTokens,
  authStatus,
  runMcp,
  SECRET_IN_VIEW,
  SIGN_IN_AGAIN,
  testMcpConnector
} from './client.js'
import { assertReadOnlyTool } from './guard.js'
import { __setRecipesForTest } from './recipes.js'
import { resourceResultData, toolResultData } from './result.js'
import { startTestMcpServer, type TestMcp } from './testServer/index.js'

const ID = 'run12345'
let server: TestMcp | null = null
let hang: http.Server | null = null

const TASKS_MAPPING = {
  itemsPath: 'tasks',
  primary: 'title',
  secondary: 'due',
  value: 'status'
}

function recipe(id: string, over: Record<string, unknown>) {
  return {
    id,
    label: id,
    description: 'Test',
    intervalMin: 5,
    settings: [],
    layout: 'list',
    mapping: TASKS_MAPPING,
    ...over
  }
}

function useRecipes(...rs: ReturnType<typeof recipe>[]): void {
  __setRecipesForTest(
    Object.fromEntries(rs.map(r => [`recipes/${r.id}.json`, r]))
  )
}

function connector(
  serverUrl: string,
  recipeId = 'example-tasks'
): Connector {
  const c: Connector = {
    id: ID,
    label: 'Tasks',
    layout: 'list',
    mapping: TASKS_MAPPING,
    intervalMin: 5,
    source: {
      kind: 'mcp',
      recipeId,
      serverUrl,
      settings: { list: 'inbox' }
    }
  }
  mem.store.set('connectors', [c])
  return c
}

beforeEach(() => {
  mem.store.clear()
  __setRecipesForTest(null)
})

afterEach(async () => {
  __setRecipesForTest(null)
  setMcpRunner(null)
  await server?.close()
  server = null
  await new Promise<void>(r => (hang ? hang.close(() => r()) : r()))
  hang = null
})

describe('runMcp without auth', () => {
  it('runs the example recipe into a 3-row list and reports notRequired', async () => {
    server = await startTestMcpServer()
    const c = connector(server.url)
    expect(authStatus(ID)).toBe('signedOut')
    const view = await runMcp(c)
    expect(view.layout).toBe('list')
    expect(view.layout === 'list' && view.rows).toHaveLength(3)
    expect(server.calls).toEqual(['list_tasks'])
    expect(authStatus(ID)).toBe('notRequired')
  })

  it.each([
    [
      'delete_task',
      'Tool "delete_task" is not marked read-only; refusing to call it'
    ],
    ['echo', 'Tool "echo" is not marked read-only; refusing to call it'],
    ['no_such_tool', 'Tool "no_such_tool" not found on the server']
  ])('refuses %s without calling it', async (name, message) => {
    server = await startTestMcpServer()
    useRecipes(recipe('guarded', { tool: { name, args: {} } }))
    const c = connector(server.url, 'guarded')
    await expect(runMcp(c)).rejects.toThrow(message)
    expect(server.calls).toEqual([])
    expect(authStatus(ID)).toBe('signedOut')
  })

  it('parses JSON text, plain text, isError and a resource', async () => {
    server = await startTestMcpServer()
    useRecipes(
      recipe('text-json', { tool: { name: 'list_tasks_text', args: {} } }),
      recipe('plain', {
        tool: { name: 'plain_text', args: {} },
        layout: 'keyvalue',
        mapping: { pairs: [{ label: 'Status', path: 'text' }] }
      }),
      recipe('fails', { tool: { name: 'failing', args: {} } }),
      recipe('res', { resource: { uri: 'tasks://today' } })
    )
    const s = server
    const run = (id: string) => runMcp(connector(s.url, id))

    const a = await run('text-json')
    expect(a.layout === 'list' && a.rows).toHaveLength(3)
    expect(await run('plain')).toEqual({
      layout: 'keyvalue',
      pairs: [{ label: 'Status', value: 'All clear' }]
    })
    await expect(run('fails')).rejects.toThrow(
      'Server error: Upstream unavailable'
    )
    const r = await run('res')
    expect(r.layout === 'list' && r.rows).toHaveLength(3)
    expect(s.calls).toEqual(['list_tasks_text', 'plain_text', 'failing'])
  })

  it('unknown recipe and unreachable server give readable errors', async () => {
    expect(
      await testMcpConnector(connector('http://127.0.0.1:1/mcp', 'gone'))
    ).toEqual({ error: 'Recipe no longer available' })
    const r = await testMcpConnector(connector('http://127.0.0.1:1/mcp'))
    expect(r).toEqual({ error: expect.any(String) })
    expect(JSON.stringify(r)).not.toContain('127.0.0.1')
  })

  it('times out after the budget', async () => {
    hang = http.createServer(() => {})
    await new Promise<void>(r => hang!.listen(0, '127.0.0.1', () => r()))
    const port = (hang.address() as AddressInfo).port
    const c = connector(`http://127.0.0.1:${port}/mcp`)
    await expect(runMcp(c, { budgetMs: 100 })).rejects.toThrow('Timed out')
    hang.closeAllConnections()
  })

  it('a failing run makes the feed stale with the message, not a throw', async () => {
    server = await startTestMcpServer()
    useRecipes(recipe('fails', { tool: { name: 'failing', args: {} } }))
    const c = connector(server.url, 'fails')
    setMcpRunner(x => runMcp(x))
    const [source] = connectorManifest(c).feeds()
    const published: unknown[] = []
    const feed = new Feed(source, {
      now: () => Date.now(),
      formatTime: () => '',
      loadCache: () => null,
      saveCache: () => {},
      publish: (_k, p) => published.push(p)
    })
    await feed.refresh()
    const payload = feed.getPayload()
    expect(payload.stale).toBe(true)
    expect(payload.error).toBe('Server error: Upstream unavailable')
    expect(published).toHaveLength(1)
  })
})

describe('runMcp with auth', () => {
  it('runs after sign-in, then asks to sign in again once tokens die', async () => {
    server = await startTestMcpServer({ auth: true })
    const s = server
    const c = connector(s.url)
    await expect(runMcp(c)).rejects.toThrow(SIGN_IN_AGAIN)
    expect(s.calls).toEqual([])

    const r = await signIn(ID, {
      openExternal: async url => {
        await s.auth!.authorizeVia(url)
      }
    })
    expect(r).toEqual({ ok: true })
    const tokens = readTokens(ID)?.tokens
    const view = await runMcp(c)
    expect(view.layout === 'list' && view.rows).toHaveLength(3)
    expect(authStatus(ID)).toBe('signedIn')

    s.auth!.expireAccessTokens()
    s.auth!.revokeRefreshTokens()
    let message = ''
    await runMcp(c).catch(e => (message = (e as Error).message))
    expect(message).toBe(SIGN_IN_AGAIN)
    expect(message).not.toContain(tokens!.access_token)
    expect(authStatus(ID)).toBe('expired')
  })
})

describe('assertReadOnlyTool', () => {
  it('pages through listTools', async () => {
    const pages = [
      {
        tools: [{ name: 'a', annotations: { readOnlyHint: true } }],
        nextCursor: 'p2'
      },
      { tools: [{ name: 'b', annotations: { readOnlyHint: true } }] }
    ]
    const listTools = vi.fn(async (p?: { cursor?: string }) =>
      p?.cursor === 'p2' ? pages[1] : pages[0]
    )
    await assertReadOnlyTool({ listTools }, 'b')
    expect(listTools).toHaveBeenCalledTimes(2)
    expect(listTools).toHaveBeenLastCalledWith({ cursor: 'p2' })
    await expect(assertReadOnlyTool({ listTools }, 'c')).rejects.toThrow(
      'Tool "c" not found on the server'
    )
  })

  it('stops after 20 pages or 1000 tools', async () => {
    let n = 0
    const endless = {
      listTools: async () => ({ tools: [], nextCursor: `c${n++}` })
    }
    await expect(assertReadOnlyTool(endless, 'x')).rejects.toThrow(
      'Server lists too many tools'
    )
    expect(n).toBe(20)
    const big = {
      listTools: async () => ({
        tools: Array.from({ length: 1001 }, (_, i) => ({ name: `t${i}` }))
      })
    }
    await expect(assertReadOnlyTool(big, 'x')).rejects.toThrow(
      'Server lists too many tools'
    )
  })
})

describe('result parsing', () => {
  it('prefers structuredContent, strips control characters from errors', () => {
    expect(
      toolResultData({
        structuredContent: { n: 1 },
        content: [{ type: 'text', text: '{"n":2}' }]
      })
    ).toEqual({ n: 1 })
    expect(() =>
      toolResultData({
        isError: true,
        content: [{ type: 'text', text: 'bad\u0007 ' + 'x'.repeat(300) }]
      })
    ).toThrow(/^Server error: bad x+…$/)
    expect(() => toolResultData({ content: [] })).toThrow('Empty result')
    expect(() =>
      toolResultData({ content: [{ type: 'image', data: 'AA' }] })
    ).toThrow('Empty result')
    expect(() =>
      resourceResultData({ contents: [{ uri: 'x://y', blob: 'AA' }] })
    ).toThrow('Binary resources are not supported')
    expect(
      resourceResultData({ contents: [{ uri: 'x', text: 'hi' }] })
    ).toBe('hi')
  })
})

describe('assertNoTokens', () => {
  it('refuses a view containing a token', () => {
    const view = { layout: 'number', value: 'tok-abc123' }
    expect(() => assertNoTokens(view, ['tok-abc123'])).toThrow(
      SECRET_IN_VIEW
    )
    expect(() => assertNoTokens(view, ['other'])).not.toThrow()
    expect(() => assertNoTokens(view, [])).not.toThrow()
  })
})
