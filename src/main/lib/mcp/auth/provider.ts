// OAuthClientProvider for the MCP SDK's `auth()`, backed by store.ts.
// interactive: a Settings sign-in with a loopback redirect.
// background: feed runs; anything that would need the user marks the
//   connector expired and throws McpAuthRequiredError.
// Nothing here logs.

import type {
  OAuthClientProvider,
  OAuthDiscoveryState
} from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationFull,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'

import {
  clock,
  deleteTokens,
  deleteVerifier,
  forgetClientInfo,
  markExpired,
  readClient,
  readTokens,
  readVerifier,
  saveClientInfo,
  writeTokens,
  writeVerifier
} from './store.js'

export class McpAuthRequiredError extends Error {
  constructor() {
    super('Sign in again in Settings')
    this.name = 'McpAuthRequiredError'
  }
}

export interface ProviderOptions {
  mode: 'interactive' | 'background'
  redirectUrl?: string
  state?: string
  onRedirect?: (url: URL) => void
  // Discovery already done by the caller (signIn), so auth() skips it.
  discovery?: OAuthDiscoveryState
}

// Background runs never redirect; this only fills the required metadata.
const PLACEHOLDER_REDIRECT = 'http://127.0.0.1/callback'

export function createProvider(
  id: string,
  opts: ProviderOptions
): OAuthClientProvider {
  const interactive = opts.mode === 'interactive'
  // Interactive sign-ins keep their verifier in memory too, so a parallel
  // attempt that overwrote the stored one can't swap it.
  let verifier: string | null = null

  const redirectUrl = (): string =>
    opts.redirectUrl ??
    readClient(id).info?.redirect_uris?.[0] ??
    PLACEHOLDER_REDIRECT

  const provider: OAuthClientProvider = {
    get redirectUrl() {
      return redirectUrl()
    },

    get clientMetadata(): OAuthClientMetadata {
      return {
        client_name: 'GlanceThing',
        redirect_uris: [redirectUrl()],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none'
      }
    },

    clientInformation(): OAuthClientInformationMixed | undefined {
      const c = readClient(id)
      if (c.manualClientId) return { client_id: c.manualClientId }
      if (!c.info) return undefined
      if (
        interactive &&
        opts.redirectUrl &&
        !(c.info.redirect_uris ?? []).includes(opts.redirectUrl)
      )
        return undefined
      return c.info
    },

    saveClientInformation(info: OAuthClientInformationMixed): void {
      // The SDK re-saves a manual id to stamp the issuer; the manual id
      // always wins, so there is nothing to keep.
      if (readClient(id).manualClientId) return
      if (!interactive) throw new McpAuthRequiredError()
      saveClientInfo(id, info as OAuthClientInformationFull)
    },

    tokens(): OAuthTokens | undefined {
      const t = readTokens(id)
      if (!t || t.expired) return undefined
      return t.tokens
    },

    saveTokens(tokens: OAuthTokens): void {
      writeTokens(id, { tokens, savedAt: clock.now() })
    },

    saveCodeVerifier(v: string): void {
      if (!interactive) return
      verifier = v
      writeVerifier(id, v)
    },

    codeVerifier(): string {
      const v = verifier ?? readVerifier(id)
      if (!v) throw new Error('No code verifier')
      return v
    },

    invalidateCredentials(scope): void {
      if (!interactive) {
        if (scope === 'tokens' || scope === 'all' || scope === 'client') {
          markExpired(id)
          throw new McpAuthRequiredError()
        }
        return
      }
      if (scope === 'all' || scope === 'tokens') deleteTokens(id)
      if (scope === 'all' || scope === 'verifier') {
        verifier = null
        deleteVerifier(id)
      }
      if (scope === 'all' || scope === 'client') forgetClientInfo(id)
    },

    redirectToAuthorization(url: URL): void {
      if (!interactive) {
        markExpired(id)
        throw new McpAuthRequiredError()
      }
      opts.onRedirect?.(url)
    }
  }

  if (opts.state) {
    const state = opts.state
    provider.state = () => state
  }
  if (opts.discovery) {
    const discovery = opts.discovery
    provider.discoveryState = () => discovery
  }
  return provider
}
