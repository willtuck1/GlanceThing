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

import {
  connectorRevision,
  deleteConnector
} from '../../connectors/store.js'
import { startTestMcpServer, type TestMcp } from '../testServer/index.js'

import { startLoopback } from './loopback.js'
import { createProvider, McpAuthRequiredError } from './provider.js'
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

  it('ignores a tampered state, keeps waiting, then times out', async () => {
    const s = await start()
    const o = opener(s, { tamperState: true })
    const r = await run({ openExternal: o.openExternal, timeoutMs: 400 })
    expect(r).toEqual({ error: 'Sign-in timed out' })
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

// Holds /token responses while `held` is set; `waitFor` polls a condition.
function tokenGate(): {
  gate: () => Promise<void>
  hold: () => void
  release: () => void
} {
  let held: Promise<void> | null = null
  let release = (): void => {}
  return {
    gate: () => held ?? Promise.resolve(),
    hold: () => {
      held = new Promise<void>(r => (release = r))
    },
    release: () => {
      held = null
      release()
    }
  }
}

async function waitFor(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !cond(); i++)
    await new Promise(r => setTimeout(r, 10))
  expect(cond()).toBe(true)
}

describe('late writes', () => {
  it('a refresh that resolves after signOut stores no tokens', async () => {
    const g = tokenGate()
    const s = await start({ accessTtlSec: 1, tokenGate: g.gate })
    const o = opener(s)
    expect(await run({ openExternal: o.openExternal })).toEqual({
      ok: true
    })
    rememberTokens()
    vi.spyOn(clock, 'now').mockReturnValue(Date.now() + 120_000)
    g.hold()
    const before = s.auth!.tokenRequests
    const refresh = ensureFresh(ID).catch(e => e)
    await waitFor(() => s.auth!.tokenRequests > before)
    signOut(ID)
    g.release()
    await refresh
    expect(s.auth!.refreshRequests).toBe(1)
    expect(mem.store.has(KEYS.tokens)).toBe(false)
    expect(authState(ID)).toBe('signedOut')
  })

  it('deleting the connector during sign-in leaves no keys', async () => {
    const g = tokenGate()
    const s = await start({ tokenGate: g.gate })
    g.hold()
    const pending = signIn(ID, {
      openExternal: async url => {
        await s.auth!.authorizeVia(url)
      }
    })
    await waitFor(() => s.auth!.tokenRequests > 0)
    expect(deleteConnector(ID)).toBe(true)
    g.release()
    expect(await pending).toEqual({ error: 'Sign-in was cancelled' })
    expect(
      [...mem.store.keys()].filter(k => k.startsWith('mcpAuth.'))
    ).toEqual([])
  })

  it('a stale background provider cannot expire a newer sign-in', async () => {
    const s = await start()
    const o = opener(s)
    expect(await run({ openExternal: o.openExternal })).toEqual({
      ok: true
    })
    const stale = createProvider(ID, {
      mode: 'background',
      serverUrl: s.url
    })
    expect(await run({ openExternal: o.openExternal })).toEqual({
      ok: true
    })
    rememberTokens()
    expect(() =>
      stale.redirectToAuthorization(new URL('https://example.com/'))
    ).toThrow(McpAuthRequiredError)
    expect(() => stale.invalidateCredentials?.('tokens')).toThrow(
      McpAuthRequiredError
    )
    stale.saveTokens({ access_token: 'stale', token_type: 'Bearer' })
    expect(authState(ID)).toBe('signedIn')
    expect(readTokens(ID)?.tokens?.access_token).not.toBe('stale')
  })
})

describe('loopback', () => {
  it('is one-shot and does not reflect input', async () => {
    const lb = await startLoopback()
    const evil = '<script>alert(1)</script>'
    const wait = lb.waitForCallback('s1')
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
    expect(await wait).toBe(evil)
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
    const wait = lb.waitForCallback('s')
    expect(
      (await fetch(`${base.origin}/other?code=x&state=s`)).status
    ).toBe(404)
    expect(
      (await fetch(`${lb.redirectUrl}?code=x&state=s`, { method: 'POST' }))
        .status
    ).toBe(405)
    await fetch(`${lb.redirectUrl}?code=c&state=s`)
    expect(await wait).toBe('c')
  })

  it('answers 400 to a missing or wrong state and keeps waiting', async () => {
    const lb = await startLoopback({ timeoutMs: 2000 })
    // Nothing is accepted before the expected state is known.
    expect((await fetch(`${lb.redirectUrl}?code=c&state=s`)).status).toBe(400)
    const wait = lb.waitForCallback('a-much-longer-state')
    for (const q of ['code=c', 'code=c&state=short', 'error=x&state=bad'])
      expect((await fetch(`${lb.redirectUrl}?${q}`)).status).toBe(400)
    const ok = await fetch(
      `${lb.redirectUrl}?code=good&state=a-much-longer-state`
    )
    expect(ok.status).toBe(200)
    expect(await wait).toBe('good')
  })

  it('a matching state with error= is denied', async () => {
    const lb = await startLoopback()
    const wait = lb.waitForCallback('s')
    wait.catch(() => {})
    await fetch(`${lb.redirectUrl}?error=access_denied&state=s`)
    await expect(wait).rejects.toThrow('Sign-in was denied')
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
