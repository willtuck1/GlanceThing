import { createHash, randomBytes } from 'crypto'

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks'
]

export interface GoogleClient {
  clientId: string
  clientSecret: string
}

export interface Tokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
}

// Posts a form and resolves with the HTTP status and parsed JSON body.
export type PostForm = (
  url: string,
  form: Record<string, string>
) => Promise<{ status: number; data: unknown }>

function base64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function createPkce(random: (n: number) => Buffer = randomBytes) {
  const verifier = base64url(random(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function createState(random: (n: number) => Buffer = randomBytes) {
  return base64url(random(16))
}

export function buildAuthUrl(opts: {
  clientId: string
  redirectUri: string
  challenge: string
  state: string
}) {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
    state: opts.state,
    // Offline access and a forced consent screen make Google return a
    // refresh token every time, even when the app was approved before.
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${AUTH_URL}?${params.toString()}`
}

export type CallbackResult =
  | { kind: 'code'; code: string }
  | { kind: 'error'; error: string }
  | { kind: 'ignore' }

// Reads the loopback redirect. Anything that is not the callback (e.g. a
// favicon request) is ignored so the server keeps waiting.
export function parseCallback(
  requestUrl: string,
  expectedState: string
): CallbackResult {
  const url = new URL(requestUrl, 'http://127.0.0.1')
  if (url.pathname !== '/callback') return { kind: 'ignore' }

  if (url.searchParams.get('state') !== expectedState)
    return { kind: 'error', error: 'State mismatch' }

  const error = url.searchParams.get('error')
  if (error) return { kind: 'error', error }

  const code = url.searchParams.get('code')
  if (!code) return { kind: 'error', error: 'Missing authorization code' }

  return { kind: 'code', code }
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

function toTokens(
  data: unknown,
  status: number,
  now: number,
  fallbackRefresh: string | null
): Tokens {
  const body = (data ?? {}) as TokenResponse
  if (status !== 200 || !body.access_token) {
    const reason = body.error_description || body.error || `HTTP ${status}`
    throw new TokenError(reason, body.error === 'invalid_grant')
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? fallbackRefresh,
    expiresAt: now + (body.expires_in ?? 3600) * 1000
  }
}

// `revoked` is true when Google says the refresh token is no longer valid,
// so callers know to drop it instead of retrying.
export class TokenError extends Error {
  constructor(
    message: string,
    public revoked = false
  ) {
    super(message)
    this.name = 'TokenError'
  }
}

export async function exchangeCode(
  post: PostForm,
  client: GoogleClient,
  code: string,
  verifier: string,
  redirectUri: string,
  now = Date.now()
) {
  const res = await post(TOKEN_URL, {
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  })
  return toTokens(res.data, res.status, now, null)
}

export async function refreshTokens(
  post: PostForm,
  client: GoogleClient,
  refreshToken: string,
  now = Date.now()
) {
  const res = await post(TOKEN_URL, {
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
  return toTokens(res.data, res.status, now, refreshToken)
}
