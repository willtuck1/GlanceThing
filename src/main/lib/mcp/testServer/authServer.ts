// Fake OAuth authorization server for tests only. Never import from production code.
import { createHash, randomBytes } from 'crypto'
import {
  IncomingMessage,
  Server,
  ServerResponse,
  createServer
} from 'http'
import { AddressInfo } from 'net'

export interface TestAuthOptions {
  accessTtlSec?: number
  dcr?: boolean
  metadataOverrides?: Record<string, string>
  // Awaited by /token after counting the request (tests hold a response).
  tokenGate?: () => Promise<void>
}

export interface TestAuthServer {
  issuer: string
  registrations: { client_id: string; redirect_uris: string[] }[]
  tokenRequests: number
  refreshRequests: number
  expireAccessTokens(): void
  revokeRefreshTokens(): void
  isValidAccessToken(token: string): boolean
  // A pre-registered client (as if typed in by the user); not in `registrations`.
  addClient(clientId: string, redirectUris: string[]): void
  authorizeVia(
    url: string,
    opts?: { tamperState?: boolean; deny?: boolean }
  ): Promise<{ status: number; location: string | null }>
  close(): Promise<void>
}

const rand = (n = 24): string => randomBytes(n).toString('base64url')

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sameRedirect(registered: string, given: string): boolean {
  try {
    const a = new URL(registered)
    const b = new URL(given)
    const loopback = (h: string): boolean =>
      h === '127.0.0.1' || h === 'localhost' || h === '[::1]'
    if (loopback(a.hostname) && loopback(b.hostname)) {
      return (
        a.protocol === b.protocol &&
        a.hostname === b.hostname &&
        a.pathname === b.pathname
      )
    }
    return registered === given
  } catch {
    return false
  }
}

interface CodeRecord {
  clientId: string
  redirectUri: string
  challenge: string
}

export async function authorizeVia(
  url: string,
  o: { tamperState?: boolean; deny?: boolean } = {}
): Promise<{ status: number; location: string | null }> {
  const first = await fetch(url, { redirect: 'manual' })
  const loc = first.headers.get('location')
  if (first.status !== 302 || !loc) {
    return { status: first.status, location: loc }
  }
  const next = new URL(loc)
  if (o.deny) {
    next.searchParams.delete('code')
    next.searchParams.set('error', 'access_denied')
  }
  if (o.tamperState) next.searchParams.set('state', 'tampered')
  // Simulate the browser following the redirect to the client's callback.
  const done = await fetch(next, { redirect: 'manual' }).catch(() => null)
  return {
    status: done?.status ?? first.status,
    location: next.toString()
  }
}

export async function startTestAuthServer(
  opts: TestAuthOptions = {}
): Promise<TestAuthServer> {
  const ttl = opts.accessTtlSec ?? 3600
  const dcr = opts.dcr !== false
  const clients = new Map<string, string[]>()
  const codes = new Map<string, CodeRecord>()
  const access = new Set<string>()
  const refresh = new Map<string, string>() // token -> clientId

  const state: TestAuthServer = {
    issuer: '',
    registrations: [],
    tokenRequests: 0,
    refreshRequests: 0,
    expireAccessTokens: () => access.clear(),
    revokeRefreshTokens: () => refresh.clear(),
    isValidAccessToken: t => access.has(t),
    addClient: (clientId, redirectUris) => {
      clients.set(clientId, redirectUris)
    },
    authorizeVia,
    close: () => closeServer(server)
  }

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', state.issuer)
    try {
      if (
        req.method === 'GET' &&
        url.pathname === '/.well-known/oauth-authorization-server'
      ) {
        const meta: Record<string, unknown> = {
          issuer: state.issuer,
          authorization_endpoint: `${state.issuer}/authorize`,
          token_endpoint: `${state.issuer}/token`,
          code_challenge_methods_supported: ['S256'],
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_methods_supported: ['none']
        }
        if (dcr) meta.registration_endpoint = `${state.issuer}/register`
        Object.assign(meta, opts.metadataOverrides)
        return json(res, 200, meta)
      }
      if (req.method === 'POST' && url.pathname === '/register') {
        if (!dcr) return json(res, 404, { error: 'not_found' })
        let body: { redirect_uris?: unknown }
        try {
          body = JSON.parse(await readBody(req))
        } catch {
          return json(res, 400, { error: 'invalid_client_metadata' })
        }
        const uris = body.redirect_uris
        if (
          !Array.isArray(uris) ||
          uris.some(u => typeof u !== 'string')
        ) {
          return json(res, 400, { error: 'invalid_redirect_uri' })
        }
        const client_id = `client-${rand(9)}`
        clients.set(client_id, uris as string[])
        state.registrations.push({
          client_id,
          redirect_uris: uris as string[]
        })
        return json(res, 201, {
          ...body,
          client_id,
          token_endpoint_auth_method: 'none'
        })
      }
      if (req.method === 'GET' && url.pathname === '/authorize') {
        const p = url.searchParams
        const clientId = p.get('client_id') ?? ''
        const redirect = p.get('redirect_uri') ?? ''
        const registered = clients.get(clientId)
        const challenge = p.get('code_challenge') ?? ''
        if (
          !registered ||
          !registered.some(r => sameRedirect(r, redirect)) ||
          p.get('response_type') !== 'code' ||
          p.get('code_challenge_method') !== 'S256' ||
          !challenge
        ) {
          return json(res, 400, { error: 'invalid_request' })
        }
        const code = rand()
        codes.set(code, { clientId, redirectUri: redirect, challenge })
        const target = new URL(redirect)
        target.searchParams.set('code', code)
        const st = p.get('state')
        if (st !== null) target.searchParams.set('state', st)
        res.writeHead(302, { location: target.toString() })
        return res.end()
      }
      if (req.method === 'POST' && url.pathname === '/token') {
        const form = new URLSearchParams(await readBody(req))
        const grant = form.get('grant_type')
        state.tokenRequests++
        if (opts.tokenGate) await opts.tokenGate()
        const issue = (clientId: string): void => {
          const a = rand()
          const r = rand()
          access.add(a)
          refresh.set(r, clientId)
          json(res, 200, {
            access_token: a,
            refresh_token: r,
            expires_in: ttl,
            token_type: 'Bearer'
          })
        }
        if (grant === 'authorization_code') {
          const rec = codes.get(form.get('code') ?? '')
          codes.delete(form.get('code') ?? '')
          const verifier = form.get('code_verifier') ?? ''
          if (
            !rec ||
            rec.clientId !== form.get('client_id') ||
            rec.redirectUri !== form.get('redirect_uri') ||
            createHash('sha256').update(verifier).digest('base64url') !==
              rec.challenge
          ) {
            return json(res, 400, { error: 'invalid_grant' })
          }
          return issue(rec.clientId)
        }
        if (grant === 'refresh_token') {
          state.refreshRequests++
          const tok = form.get('refresh_token') ?? ''
          const clientId = refresh.get(tok)
          if (!clientId || clientId !== form.get('client_id')) {
            return json(res, 400, { error: 'invalid_grant' })
          }
          refresh.delete(tok)
          return issue(clientId)
        }
        return json(res, 400, { error: 'unsupported_grant_type' })
      }
      json(res, 404, { error: 'not_found' })
    } catch {
      json(res, 500, { error: 'server_error' })
    }
  })

  await new Promise<void>(resolve =>
    server.listen(0, '127.0.0.1', resolve)
  )
  state.issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return state
}

export function closeServer(server: Server): Promise<void> {
  return new Promise(resolve => {
    server.close(() => resolve())
    server.closeAllConnections()
  })
}
