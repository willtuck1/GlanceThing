import { createHash, randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { afterEach, describe, expect, it } from 'vitest'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { TestMcp, authorizeVia, startTestMcpServer } from './index.js'

const open: TestMcp[] = []
afterEach(async () => {
  while (open.length) await open.pop()!.close()
})

async function start(o?: Parameters<typeof startTestMcpServer>[0]) {
  const s = await startTestMcpServer(o)
  open.push(s)
  return s
}

async function withClient<T>(
  url: string,
  fn: (c: Client) => Promise<T>,
  headers?: Record<string, string>
): Promise<T> {
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers }
    })
  )
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

function fixturePath(name: string): URL {
  return new URL(`../fixtures/${name}`, import.meta.url)
}

function matchFixture(name: string, live: unknown): void {
  const path = fixturePath(name)
  if (process.env.UPDATE_FIXTURES || !existsSync(path)) {
    writeFileSync(path, JSON.stringify(live, null, 2) + '\n')
  }
  expect(JSON.parse(JSON.stringify(live))).toEqual(
    JSON.parse(readFileSync(path, 'utf8'))
  )
}

describe('test MCP server without auth', () => {
  it('lists tools, calls list_tasks, reads the resource', async () => {
    const s = await start()
    await withClient(s.url, async c => {
      const { tools } = await c.listTools()
      expect(tools.map(t => t.name).sort()).toEqual(
        [
          'delete_task',
          'echo',
          'failing',
          'list_tasks',
          'list_tasks_text',
          'plain_text'
        ].sort()
      )
      const by = (n: string) => tools.find(t => t.name === n)!
      expect(by('list_tasks').annotations).toEqual({ readOnlyHint: true })
      expect(by('delete_task').annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true
      })
      expect(by('echo').annotations).toBeUndefined()

      const r = await c.callTool({ name: 'list_tasks', arguments: {} })
      expect(
        (r.structuredContent as { tasks: unknown[] }).tasks
      ).toHaveLength(3)
      const f = await c.callTool({ name: 'failing', arguments: {} })
      expect(f.isError).toBe(true)
      const res = await c.readResource({ uri: 'tasks://today' })
      expect(
        JSON.parse((res.contents[0] as { text: string }).text).tasks
      ).toHaveLength(3)
    })
    expect(s.calls).toEqual(['list_tasks', 'failing'])
  })

  it('returns 405 for GET and DELETE', async () => {
    const s = await start()
    for (const method of ['GET', 'DELETE']) {
      expect((await fetch(s.url, { method })).status).toBe(405)
    }
  })

  it('fixtures match live output', async () => {
    const s = await start()
    await withClient(s.url, async c => {
      matchFixture('tools-list.json', await c.listTools())
      matchFixture(
        'list_tasks.result.json',
        await c.callTool({ name: 'list_tasks', arguments: {} })
      )
    })
  })
})

describe('test MCP server with auth', () => {
  const redirect = 'http://127.0.0.1:5555/callback'

  async function flow(
    s: TestMcp,
    verifier: string,
    challengeFrom = verifier
  ) {
    const as = s.auth!
    const reg = await fetch(`${as.issuer}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [redirect] })
    })
    const { client_id } = (await reg.json()) as { client_id: string }
    const challenge = createHash('sha256')
      .update(challengeFrom)
      .digest('base64url')
    const q = new URLSearchParams({
      client_id,
      redirect_uri: redirect,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz'
    })
    const r = await authorizeVia(`${as.issuer}/authorize?${q}`)
    const loc = new URL(r.location!)
    expect(loc.searchParams.get('state')).toBe('xyz')
    const code = loc.searchParams.get('code')!
    const token = (body: Record<string, string>) =>
      fetch(`${as.issuer}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body)
      })
    return {
      client_id,
      code,
      exchange: (v = verifier, ru = redirect) =>
        token({
          grant_type: 'authorization_code',
          code,
          client_id,
          redirect_uri: ru,
          code_verifier: v
        }),
      refresh: (rt: string) =>
        token({
          grant_type: 'refresh_token',
          refresh_token: rt,
          client_id
        })
    }
  }

  it('challenges, serves metadata, and rejects bad requests', async () => {
    const s = await start({ auth: true })
    const base = s.url.replace('/mcp', '')
    const bare = await fetch(s.url, { method: 'POST' })
    expect(bare.status).toBe(401)
    expect(bare.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`
    )
    const prm = await (
      await fetch(`${base}/.well-known/oauth-protected-resource`)
    ).json()
    expect(prm).toEqual({
      resource: s.url,
      authorization_servers: [s.auth!.issuer]
    })
    const as = await (
      await fetch(
        `${s.auth!.issuer}/.well-known/oauth-authorization-server`
      )
    ).json()
    expect(as.registration_endpoint).toBe(`${s.auth!.issuer}/register`)
    expect(as.code_challenge_methods_supported).toEqual(['S256'])

    const verifier = randomBytes(32).toString('base64url')
    const f1 = await flow(s, verifier)
    expect((await f1.exchange('wrong-verifier')).status).toBe(400)
    const f2 = await flow(s, verifier)
    expect(
      (await f2.exchange(verifier, 'http://127.0.0.1:1/other')).status
    ).toBe(400)
    const f3 = await flow(s, verifier)
    expect((await f3.exchange()).status).toBe(200)
    const again = await f3.exchange()
    expect(again.status).toBe(400)
    expect((await again.json()).error).toBe('invalid_grant')

    const bad = await authorizeVia(
      `${s.auth!.issuer}/authorize?client_id=nope&redirect_uri=${redirect}&response_type=code&code_challenge=x&code_challenge_method=S256`
    )
    expect(bad.status).toBe(400)
  })

  it('issues tokens, rotates refresh, expires access', async () => {
    const s = await start({ auth: { accessTtlSec: 60 } })
    const verifier = randomBytes(32).toString('base64url')
    const f = await flow(s, verifier)
    const t1 = await (await f.exchange()).json()
    expect(t1.token_type).toBe('Bearer')
    expect(t1.expires_in).toBe(60)

    await withClient(
      s.url,
      async c => expect((await c.listTools()).tools).toHaveLength(6),
      { authorization: `Bearer ${t1.access_token}` }
    )

    const t2 = await (await f.refresh(t1.refresh_token)).json()
    expect(t2.refresh_token).not.toBe(t1.refresh_token)
    expect((await f.refresh(t1.refresh_token)).status).toBe(400)
    expect(s.auth!.refreshRequests).toBe(2)

    s.auth!.expireAccessTokens()
    const res = await fetch(s.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${t2.access_token}` }
    })
    expect(res.status).toBe(401)

    s.auth!.revokeRefreshTokens()
    expect((await f.refresh(t2.refresh_token)).status).toBe(400)
  })

  it('omits registration with dcr:false and applies overrides', async () => {
    const s = await start({
      auth: {
        dcr: false,
        metadataOverrides: {
          token_endpoint: 'http://169.254.169.254/token'
        }
      }
    })
    const as = await (
      await fetch(
        `${s.auth!.issuer}/.well-known/oauth-authorization-server`
      )
    ).json()
    expect(as.registration_endpoint).toBeUndefined()
    expect(as.token_endpoint).toBe('http://169.254.169.254/token')
  })
})
