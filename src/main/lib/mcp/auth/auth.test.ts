import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  sets: [] as { key: string; secure: boolean; value: unknown }[],
  secure: true
}))

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => mem.secure }
}))

vi.mock('../../storage.js', () => ({
  getStorageValue: (key: string) => mem.store.get(key) ?? null,
  setStorageValue: (key: string, value: unknown, secure = false) => {
    mem.sets.push({ key, secure, value })
    mem.store.set(key, value)
  },
  deleteStorageValue: (key: string) => {
    mem.store.delete(key)
  }
}))

import { connectorRevision } from '../../connectors/store.js'
import { startTestMcpServer, type TestMcp } from '../testServer/index.js'

import { startLoopback } from './loopback.js'
import { McpAuthRequiredError } from './provider.js'
import { ensureFresh, NO_DCR_MESSAGE, signIn } from './signIn.js'
import {
  authState,
  clock,
  getManualClientId,
  readClient,
  readTokens,
  setManualClientId,
  signOut
} from './store.js'

const ID = 'abcd1234'
const KEYS = {
  tokens: `mcpAuth.${ID}.tokens`,
  client: `mcpAuth.${ID}.client`,
  verifier: `mcpAuth.${ID}.verifier`
}

// Collected across tests; the last test checks no error leaks any of them.
const errors: string[] = []
const secrets: string[] = []

let server: TestMcp | null = null

function addConnector(serverUrl: string): void {
  mem.store.set('connectors', [
    {
      id: ID,
      label: 'Tasks',
      layout: 'number',
      mapping: { value: 'n' },
      intervalMin: 5,
      source: { kind: 'mcp', recipeId: 'example-tasks', serverUrl }
    }
  ])
}

async function start(
  auth: NonNullable<
    Parameters<typeof startTestMcpServer>[0]
  >['auth'] = true
): Promise<TestMcp> {
  server = await startTestMcpServer({ auth })
  addConnector(server.url)
  return server
}

interface Opened {
  url: URL
  callback: URL | null
}

function opener(
  s: TestMcp,
  opts: { tamperState?: boolean; deny?: boolean } = {}
): { openExternal: (url: string) => Promise<void>; opened: Opened[] } {
  const opened: Opened[] = []
  return {
    opened,
    openExternal: async (url: string) => {
      const r = await s.auth!.authorizeVia(url, opts)
      const callback = r.location ? new URL(r.location) : null
      opened.push({ url: new URL(url), callback })
      const code = callback?.searchParams.get('code')
      const state = new URL(url).searchParams.get('state')
      if (code) secrets.push(code)
      if (state) secrets.push(state)
    }
  }
}

async function run(
  deps: Parameters<typeof signIn>[1]
): Promise<Awaited<ReturnType<typeof signIn>>> {
  const r = await signIn(ID, deps)
  if ('error' in r) errors.push(r.error)
  return r
}

function rememberTokens(): void {
  const t = readTokens(ID)?.tokens
  if (t?.access_token) secrets.push(t.access_token)
  if (t?.refresh_token) secrets.push(t.refresh_token)
}

beforeEach(() => {
  mem.store.clear()
  mem.sets.length = 0
  mem.secure = true
})

afterEach(async () => {
  vi.restoreAllMocks()
  await server?.close()
  server = null
})

describe('signIn', () => {
  it('registers, uses PKCE S256, stores tokens securely and bumps the revision', async () => {
    const s = await start()
    const o = opener(s)
    const rev = connectorRevision(ID)

    expect(await run({ openExternal: o.openExternal })).toEqual({
      ok: true
    })
    rememberTokens()

    expect(s.auth!.registrations).toHaveLength(1)
    expect(o.opened).toHaveLength(1)
    const q = o.opened[0].url.searchParams
    expect(q.get('code_challenge_method')).toBe('S256')
    const challenge = q.get('code_challenge') ?? ''
    expect(challenge.length).toBeGreaterThanOrEqual(43)

    const tokenSet = mem.sets.find(x => x.key === KEYS.tokens)
    expect(tokenSet?.secure).toBe(true)
    for (const x of mem.sets.filter(x => x.key.startsWith('mcpAuth.')))
      expect(x.secure).toBe(true)
    expect(readTokens(ID)?.tokens?.access_token).toBeTruthy()
    expect(authState(ID)).toBe('signedIn')
    expect(mem.store.has(KEYS.verifier)).toBe(false)
    expect(connectorRevision(ID)).toBe(rev + 1)

    // The token request carried the verifier matching the challenge.
    const verifier = mem.sets.find(x => x.key === KEYS.verifier)
      ?.value as string
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      challenge
    )

    // The code is single-use: replaying the exchange fails.
    const cb = o.opened[0].callback!
    const replay = await fetch(`${s.auth!.issuer}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: cb.searchParams.get('code') ?? '',
        code_verifier: verifier,
        client_id: s.auth!.registrations[0].client_id,
        redirect_uri: `${cb.origin}${cb.pathname}`
      })
    })
    expect(replay.status).toBe(400)
    expect(s.auth!.tokenRequests).toBe(2)
  })

  it('refuses a tampered state and stores no tokens', async () => {
    const s = await start()
    const o = opener(s, { tamperState: true })
    const r = await run({ openExternal: o.openExternal })
    expect(r).toEqual({
      error: "Sign-in failed: the response didn't match. Try again"
    })
    expect(mem.store.has(KEYS.tokens)).toBe(false)
    expect(mem.store.has(KEYS.verifier)).toBe(false)
    expect(s.auth!.tokenRequests).toBe(0)
  })

  it('reports a denied sign-in', async () => {
    const s = await start()
    const o = opener(s, { deny: true })
    expect(await run({ openExternal: o.openExternal })).toEqual({
      error: 'Sign-in was denied'
    })
    expect(mem.store.has(KEYS.tokens)).toBe(false)
  })

  it('re-registers on a second sign-in because the loopback port changes', async () => {
    const s = await start()
    const o = opener(s)
    expect(await run({ openExternal: o.openExternal })).toEqual({
      ok: true
    })
    rememberTokens()
    expect(await run({ openExternal: o.openExternal })).toEqual({
      ok: true
    })
    rememberTokens()
    expect(s.auth!.registrations).toHaveLength(2)
    expect(readClient(ID).info?.client_id).toBe(
      s.auth!.registrations[1].client_id
    )
    expect(authState(ID)).toBe('signedIn')
  })

  it('a second sign-in cancels the first', async () => {
    const s = await start()
    const o = opener(s)
    let reached!: () => void
    const firstOpened = new Promise<void>(r => (reached = r))
    const first = signIn(ID, {
      openExternal: () => {
        reached()
      }
    })
    await firstOpened
    const second = await run({ openExternal: o.openExternal })
    expect(await first).toEqual({ error: 'Sign-in was cancelled' })
    expect(second).toEqual({ ok: true })
    rememberTokens()
  })

  it('needs a client ID when the server has no DCR, and uses it without registering', async () => {
    const s = await start({ dcr: false })
    const o = opener(s)
    expect(await run({ openExternal: o.openExternal })).toEqual({
      error: NO_DCR_MESSAGE
    })
    expect(o.opened).toHaveLength(0)

    setManualClientId(ID, 'my-client')
    s.auth!.addClient('my-client', ['http://127.0.0.1/callback'])
    expect(await run({ openExternal: o.openExternal })).toEqual({
      ok: true
    })
    rememberTokens()
    expect(s.auth!.registrations).toHaveLength(0)
    expect(o.opened[0].url.searchParams.get('client_id')).toBe('my-client')
    expect(getManualClientId(ID)).toBe('my-client')

    // signOut keeps the manual id, removes the rest, bumps the revision.
    const rev = connectorRevision(ID)
    signOut(ID)
    expect(getManualClientId(ID)).toBe('my-client')
    expect(readClient(ID).info).toBeUndefined()
    expect(mem.store.has(KEYS.tokens)).toBe(false)
    expect(mem.store.has(KEYS.verifier)).toBe(false)
    expect(authState(ID)).toBe('signedOut')
    expect(connectorRevision(ID)).toBe(rev + 1)
  })

  it('changing the manual client id clears tokens and the registration', async () => {
    const s = await start()
    const o = opener(s)
    expect(await run({ openExternal: o.openExternal })).toEqual({
      ok: true
    })
    rememberTokens()
    setManualClientId(ID, 'other-client')
    expect(mem.store.has(KEYS.tokens)).toBe(false)
    expect(readClient(ID)).toEqual({ manualClientId: 'other-client' })
    expect(() => setManualClientId(ID, '')).toThrow('Client ID')
    expect(() => setManualClientId(ID, 'a\nb')).toThrow('Client ID')
    setManualClientId(ID, null)
    expect(mem.store.has(KEYS.client)).toBe(false)
  })

  it('signOut after a DCR sign-in removes tokens and the registration', async () => {
    const s = await start()
    const o = opener(s)
    await run({ openExternal: o.openExternal })
    rememberTokens()
    signOut(ID)
    expect(mem.store.has(KEYS.tokens)).toBe(false)
    expect(mem.store.has(KEYS.client)).toBe(false)
  })

  it('refuses when secure storage is unavailable and writes nothing', async () => {
    const s = await start()
    mem.secure = false
    const openExternal = vi.fn()
    expect(await run({ openExternal })).toEqual({
      error: 'Secure storage unavailable on this system'
    })
    expect(openExternal).not.toHaveBeenCalled()
    expect(mem.sets.filter(x => x.key.startsWith('mcpAuth.'))).toEqual([])
    expect(s.auth!.registrations).toHaveLength(0)
    expect(() => setManualClientId(ID, 'x')).toThrow(
      'Secure storage unavailable on this system'
    )
  })

  it('refuses a link-local token endpoint', async () => {
    const s = await start({
      metadataOverrides: { token_endpoint: 'http://169.254.169.254/token' }
    })
    const o = opener(s)
    expect(await run({ openExternal: o.openExternal })).toEqual({
      error: 'Link-local and reserved addresses are not allowed'
    })
    expect(mem.store.has(KEYS.tokens)).toBe(false)
  })

  it('refuses a public http authorization endpoint before opening it', async () => {
    await start({
      metadataOverrides: {
        authorization_endpoint: 'http://example.com/authorize'
      }
    })
    const openExternal = vi.fn()
    const r = await run({
      openExternal,
      resolve: async () => ['93.184.216.34']
    })
    expect(r).toEqual({ error: 'Public hosts must use https' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('reports a server without sign-in metadata', async () => {
    server = await startTestMcpServer()
    addConnector(server.url)
    expect(await run({ openExternal: vi.fn() })).toEqual({
      error: "Couldn't find the server's sign-in details"
    })
  })

  it('rejects an unknown connector', async () => {
    expect(await signIn('zzzzzzzz')).toEqual({
      error: 'Connector not found'
    })
  })
})

describe('ensureFresh', () => {
  it('refreshes an access token near expiry', async () => {
    const s = await start({ accessTtlSec: 1 })
    const o = opener(s)
    expect(await run({ openExternal: o.openExternal })).toEqual({
      ok: true
    })
    rememberTokens()
    const before = readTokens(ID)!.tokens!.access_token
    const t0 = Date.now()
    vi.spyOn(clock, 'now').mockReturnValue(t0 + 120_000)
    await ensureFresh(ID)
    rememberTokens()
    expect(s.auth!.refreshRequests).toBe(1)
    expect(readTokens(ID)!.tokens!.access_token).not.toBe(before)
    expect(readTokens(ID)!.savedAt).toBe(t0 + 120_000)
    expect(authState(ID)).toBe('signedIn')
  })

  it('does nothing while the token is fresh', async () => {
    const s = await start()
    const o = opener(s)
    await run({ openExternal: o.openExternal })
    rememberTokens()
    await ensureFresh(ID)
    expect(s.auth!.refreshRequests).toBe(0)
  })

  it('throws McpAuthRequiredError and marks expired when refresh is revoked', async () => {
    const s = await start({ accessTtlSec: 1 })
    const o = opener(s)
    await run({ openExternal: o.openExternal })
    rememberTokens()
    s.auth!.revokeRefreshTokens()
    s.auth!.expireAccessTokens()
    vi.spyOn(clock, 'now').mockReturnValue(Date.now() + 120_000)
    const regs = s.auth!.registrations.length
    const err = await ensureFresh(ID).catch(e => e)
    expect(err).toBeInstanceOf(McpAuthRequiredError)
    errors.push((err as Error).message)
    expect(authState(ID)).toBe('expired')
    expect(readTokens(ID)?.tokens).toBeUndefined()
    expect(s.auth!.registrations).toHaveLength(regs)
    expect(mem.store.has(KEYS.verifier)).toBe(false)
    // Stays expired without touching the network.
    await expect(ensureFresh(ID)).rejects.toBeInstanceOf(
      McpAuthRequiredError
    )
  })
})

describe('loopback', () => {
  it('is one-shot and does not reflect input', async () => {
    const lb = await startLoopback()
    const evil = '<script>alert(1)</script>'
    const res = await fetch(
      `${lb.redirectUrl}?state=s1&code=${encodeURIComponent(evil)}`
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).not.toContain('script')
    expect(body).not.toContain('s1')
    expect(res.headers.get('content-security-policy')).toContain(
      "default-src 'none'"
    )
    expect(await lb.waitForCallback('s1')).toBe(evil)
    const again = await fetch(`${lb.redirectUrl}?state=s1&code=x`).then(
      r => r.status,
      () => 'refused'
    )
    expect(again).not.toBe(200)
    lb.close()
    lb.close()
  })

  it('answers 404 elsewhere and 405 for other methods without consuming', async () => {
    const lb = await startLoopback()
    const base = new URL(lb.redirectUrl)
    expect(
      (await fetch(`${base.origin}/other?code=x&state=s`)).status
    ).toBe(404)
    expect(
      (await fetch(`${lb.redirectUrl}?code=x&state=s`, { method: 'POST' }))
        .status
    ).toBe(405)
    await fetch(`${lb.redirectUrl}?code=c&state=s`)
    expect(await lb.waitForCallback('s')).toBe('c')
  })

  it('handles a state of a different length', async () => {
    const lb = await startLoopback()
    await fetch(`${lb.redirectUrl}?code=c&state=short`)
    await expect(
      lb.waitForCallback('a-much-longer-state')
    ).rejects.toThrow("didn't match")
  })

  it('times out and closes', async () => {
    const lb = await startLoopback({ timeoutMs: 50 })
    await expect(lb.waitForCallback('s')).rejects.toThrow(
      'Sign-in timed out'
    )
    const after = await fetch(`${lb.redirectUrl}?code=c&state=s`).then(
      r => r.status,
      () => 'refused'
    )
    expect(after).toBe('refused')
    lb.close()
  })
})

describe('error strings', () => {
  it('never contain tokens, codes or state', () => {
    expect(errors.length).toBeGreaterThan(5)
    expect(secrets.length).toBeGreaterThan(5)
    for (const e of errors)
      for (const s of secrets) expect(e.includes(s)).toBe(false)
  })
})
