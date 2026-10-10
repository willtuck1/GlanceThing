// MCP OAuth sign-in (Settings) and token refresh (before feed runs).
// The SDK's auth() does discovery, DCR, PKCE S256, the code exchange and
// refresh; every request it makes goes through safeFetch. Error strings are
// fixed: never a token, code, state, verifier or URL. Nothing here logs.

import { randomBytes } from 'node:crypto'

import {
  auth,
  discoverOAuthServerInfo,
  type OAuthDiscoveryState
} from '@modelcontextprotocol/sdk/client/auth.js'
import { OAuthError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import { shell } from 'electron'

import { ConnectorFetchError } from '../../connectors/address.js'
import {
  bumpConnectorRevision,
  connectorRevision,
  getConnector
} from '../../connectors/store.js'
import { safeFetch } from '../../connectors/safeFetch.js'
import {
  defaultResolve,
  prepareHop,
  type Resolve
} from '../../connectors/hop.js'
import type { McpSource } from '../../connectors/types.js'

import { startLoopback, type Loopback } from './loopback.js'
import { createProvider, McpAuthRequiredError } from './provider.js'
import {
  accessExpiresAt,
  clock,
  deleteVerifier,
  isSecureStorageAvailable,
  readClient,
  readTokens,
  registerSignInCancel,
  SECURE_STORAGE_UNAVAILABLE,
  tokensFor
} from './store.js'

export interface SignInDeps {
  openExternal?: (url: string) => Promise<unknown> | unknown
  timeoutMs?: number
  // Tests only: DNS for the authorization URL check.
  resolve?: Resolve
}

export type SignInResult = { ok: true } | { error: string }

export const NO_DCR_MESSAGE =
  "This server doesn't support automatic registration; enter a client ID"
const DISCOVERY_MESSAGE = "Couldn't find the server's sign-in details"
const REFRESH_MARGIN_MS = 60_000

// Readable, fixed messages only.
class SignInError extends Error {}

interface Attempt {
  cancelled: boolean
  loopback?: Loopback
}

const active = new Map<string, Attempt>()

function mcpSource(id: string): McpSource | null {
  const c = typeof id === 'string' ? getConnector(id) : null
  return c && c.source.kind === 'mcp' ? c.source : null
}

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h)
}

// The browser opens this URL, so it is checked like a fetch hop but never
// fetched: https, or http to a loopback host only.
async function checkAuthorizationUrl(
  url: URL,
  resolve: Resolve
): Promise<void> {
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname))
    throw new SignInError('Public hosts must use https')
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new SignInError('Unsupported URL scheme')
  if (url.username || url.password)
    throw new SignInError('Unsupported sign-in address')
  await prepareHop(url, resolve)
}

async function discover(serverUrl: string): Promise<OAuthDiscoveryState> {
  let info: OAuthDiscoveryState
  try {
    info = await discoverOAuthServerInfo(serverUrl, { fetchFn: safeFetch })
  } catch (e) {
    if (e instanceof ConnectorFetchError) throw e
    throw new SignInError(DISCOVERY_MESSAGE)
  }
  if (!info.authorizationServerMetadata)
    throw new SignInError(DISCOVERY_MESSAGE)
  return info
}

function readableError(e: unknown): string {
  if (e instanceof SignInError || e instanceof ConnectorFetchError)
    return e.message
  if (e instanceof McpAuthRequiredError) return e.message
  if (e instanceof Error) {
    if (
      [
        SECURE_STORAGE_UNAVAILABLE,
        'Sign-in timed out',
        'Sign-in was cancelled',
        'Sign-in was denied',
        "Sign-in failed: the response didn't match. Try again",
        'Sign-in failed: no authorization code'
      ].includes(e.message)
    )
      return e.message
    if (/dynamic client registration/i.test(e.message))
      return NO_DCR_MESSAGE
  }
  if (e instanceof OAuthError)
    return 'The server refused the sign-in. Try again'
  return 'Sign-in failed'
}

export async function signIn(
  id: string,
  deps: SignInDeps = {}
): Promise<SignInResult> {
  const openExternal =
    deps.openExternal ?? ((url: string) => shell.openExternal(url))
  const resolve = deps.resolve ?? defaultResolve

  const source = mcpSource(id)
  if (!source) return { error: 'Connector not found' }
  if (!isSecureStorageAvailable())
    return { error: SECURE_STORAGE_UNAVAILABLE }

  // A second sign-in for the same connector cancels the first.
  const previous = active.get(id)
  if (previous) {
    previous.cancelled = true
    previous.loopback?.close()
  }
  const attempt: Attempt = { cancelled: false }
  active.set(id, attempt)
  // signOut and deleteConnector cancel through this and bump the revision;
  // this attempt's provider may write only while the revision is unchanged.
  const unregister = registerSignInCancel(id, () => {
    attempt.cancelled = true
    attempt.loopback?.close()
  })
  const revision = connectorRevision(id)
  const checkCancelled = (): void => {
    if (
      attempt.cancelled ||
      connectorRevision(id) !== revision ||
      !getConnector(id)
    )
      throw new SignInError('Sign-in was cancelled')
  }

  let ok = false
  try {
    const serverUrl = source.serverUrl
    const discovery = await discover(serverUrl)
    checkCancelled()
    if (
      !readClient(id).manualClientId &&
      !discovery.authorizationServerMetadata?.registration_endpoint
    )
      throw new SignInError(NO_DCR_MESSAGE)

    const loopback = await startLoopback({ timeoutMs: deps.timeoutMs })
    attempt.loopback = loopback
    if (attempt.cancelled) loopback.close()
    checkCancelled()

    const state = randomBytes(32).toString('base64url')
    let authorizationUrl: URL | null = null
    const provider = createProvider(id, {
      mode: 'interactive',
      serverUrl,
      revision,
      cancelled: () => attempt.cancelled,
      redirectUrl: loopback.redirectUrl,
      state,
      discovery,
      onRedirect: url => {
        authorizationUrl = url
      }
    })

    const first = await auth(provider, { serverUrl, fetchFn: safeFetch })
    checkCancelled()
    if (first === 'REDIRECT') {
      const url = authorizationUrl as URL | null
      if (!url) throw new SignInError('Sign-in failed')
      await checkAuthorizationUrl(url, resolve)
      checkCancelled()
      const callback = loopback.waitForCallback(state)
      callback.catch(() => {})
      await openExternal(url.href)
      const code = await callback
      checkCancelled()
      const second = await auth(provider, {
        serverUrl,
        authorizationCode: code,
        fetchFn: safeFetch
      })
      checkCancelled()
      if (second !== 'AUTHORIZED') throw new SignInError('Sign-in failed')
    }
    ok = true
    return { ok: true }
  } catch (e) {
    return { error: readableError(e) }
  } finally {
    unregister()
    attempt.loopback?.close()
    if (active.get(id) === attempt) {
      active.delete(id)
      try {
        deleteVerifier(id)
      } catch {
        // Storage failures must not turn a result into a rejection.
      }
    }
    // After this attempt's own writes: older providers can no longer write.
    if (ok) bumpConnectorRevision(id)
  }
}

// Refreshes the access token before a background run when it is within a
// minute of expiry. Throws McpAuthRequiredError when the user must sign in.
export async function ensureFresh(id: string): Promise<void> {
  // No stored tokens (including an unsaved draft under a temporary id):
  // proceed without auth; the server decides whether that is enough.
  if (!readTokens(id)) return
  const source = mcpSource(id)
  if (!source) throw new Error('Connector not found')
  // Tokens issued for another origin are never used: as if signed out.
  const t = tokensFor(id, source.serverUrl)
  if (!t) return
  if (t.expired || !t.tokens) throw new McpAuthRequiredError()
  const exp = accessExpiresAt(t)
  if (exp === null || clock.now() < exp - REFRESH_MARGIN_MS) return
  if (!t.tokens.refresh_token) throw new McpAuthRequiredError()
  const c = readClient(id)
  if (!c.manualClientId && !c.info) throw new McpAuthRequiredError()
  const provider = createProvider(id, {
    mode: 'background',
    serverUrl: source.serverUrl
  })
  const result = await auth(provider, {
    serverUrl: source.serverUrl,
    fetchFn: safeFetch
  })
  if (result !== 'AUTHORIZED') throw new McpAuthRequiredError()
}
