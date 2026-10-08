import { createHash } from 'crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  AUTH_URL,
  buildAuthUrl,
  createPkce,
  exchangeCode,
  parseCallback,
  refreshTokens,
  SCOPES,
  TOKEN_URL,
  TokenError
} from './oauth.js'

const client = { clientId: 'id.apps.googleusercontent.com', clientSecret: 's' }

describe('createPkce', () => {
  it('derives an S256 challenge from a url-safe verifier', () => {
    const { verifier, challenge } = createPkce()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64url')
    expect(challenge).toBe(expected)
  })
})

describe('buildAuthUrl', () => {
  it('requests offline access with PKCE and both scopes', () => {
    const url = new URL(
      buildAuthUrl({
        clientId: client.clientId,
        redirectUri: 'http://127.0.0.1:5000/callback',
        challenge: 'abc',
        state: 'st'
      })
    )
    expect(`${url.origin}${url.pathname}`).toBe(AUTH_URL)
    const p = url.searchParams
    expect(p.get('client_id')).toBe(client.clientId)
    expect(p.get('redirect_uri')).toBe('http://127.0.0.1:5000/callback')
    expect(p.get('code_challenge')).toBe('abc')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('state')).toBe('st')
    expect(p.get('access_type')).toBe('offline')
    expect(p.get('scope')?.split(' ')).toEqual(SCOPES)
  })
})

describe('parseCallback', () => {
  it('returns the code when state matches', () => {
    expect(parseCallback('/callback?code=c1&state=st', 'st')).toEqual({
      kind: 'code',
      code: 'c1'
    })
  })

  it('rejects a mismatched state', () => {
    expect(parseCallback('/callback?code=c1&state=x', 'st')).toEqual({
      kind: 'badState'
    })
    expect(parseCallback('/callback?error=access_denied', 'st')).toEqual({
      kind: 'badState'
    })
  })

  it('reports a denied consent', () => {
    expect(
      parseCallback('/callback?error=access_denied&state=st', 'st')
    ).toEqual({ kind: 'error', error: 'access_denied' })
  })

  it('ignores other paths', () => {
    expect(parseCallback('/favicon.ico', 'st')).toEqual({ kind: 'ignore' })
  })
})

describe('token requests', () => {
  it('exchanges a code with the verifier', async () => {
    const post = vi.fn(async () => ({
      status: 200,
      data: { access_token: 'a', refresh_token: 'r', expires_in: 60 }
    }))
    const tokens = await exchangeCode(
      post,
      client,
      'code',
      'verifier',
      'http://127.0.0.1:1/callback',
      1000
    )
    expect(tokens).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 61_000
    })
    expect(post).toHaveBeenCalledWith(TOKEN_URL, {
      client_id: client.clientId,
      client_secret: 's',
      code: 'code',
      code_verifier: 'verifier',
      grant_type: 'authorization_code',
      redirect_uri: 'http://127.0.0.1:1/callback'
    })
  })

  it('keeps the old refresh token when Google does not send a new one', async () => {
    const post = vi.fn(async () => ({
      status: 200,
      data: { access_token: 'a2', expires_in: 3600 }
    }))
    const tokens = await refreshTokens(post, client, 'r1', 0)
    expect(tokens.refreshToken).toBe('r1')
    expect(tokens.accessToken).toBe('a2')
  })

  it('flags invalid_grant as revoked', async () => {
    const post = vi.fn(async () => ({
      status: 400,
      data: { error: 'invalid_grant', error_description: 'Token revoked' }
    }))
    const err = await refreshTokens(post, client, 'r1').catch(e => e)
    expect(err).toBeInstanceOf(TokenError)
    expect(err.revoked).toBe(true)
    expect(err.message).toBe('Token revoked')
  })

  it('treats other failures as not revoked', async () => {
    const post = vi.fn(async () => ({ status: 503, data: '' }))
    const err = await refreshTokens(post, client, 'r1').catch(e => e)
    expect(err).toBeInstanceOf(TokenError)
    expect(err.revoked).toBe(false)
  })
})
