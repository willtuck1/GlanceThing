import { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it, vi } from 'vitest'

import { PostForm } from './oauth.js'
import { createGoogleSession, NotConnectedError, REVOKED } from './session.js'

const client = { clientId: 'id', clientSecret: 'secret' }

function respond(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown = {}
): AxiosResponse {
  return { config, status, statusText: '', headers: {}, data }
}

// Fake Google API: accepts only the given access token.
function fakeApi(validToken: () => string) {
  return vi.fn<AxiosAdapter>(async config => {
    const auth = config.headers.get('Authorization')
    if (auth !== `Bearer ${validToken()}`) {
      const res = respond(config, 401)
      const err = Object.assign(new Error('401'), {
        isAxiosError: true,
        config,
        response: res
      })
      throw err
    }
    return respond(config, 200, { ok: true })
  })
}

function setup(opts: { refreshToken?: string | null } = {}) {
  let stored: string | null =
    opts.refreshToken === undefined ? 'refresh-1' : opts.refreshToken
  let issued = 0
  const post = vi.fn<PostForm>(async () => ({
    status: 200,
    data: { access_token: `access-${++issued}`, expires_in: 3600 }
  }))
  const adapter = fakeApi(() => `access-${issued}`)
  const setRefreshToken = vi.fn((t: string | null) => {
    stored = t
  })
  const session = createGoogleSession({
    getClient: () => client,
    getRefreshToken: () => stored,
    setRefreshToken,
    post,
    now: () => 0,
    axiosConfig: { adapter }
  })
  return { session, post, adapter, setRefreshToken }
}

describe('createGoogleSession', () => {
  it('fails with NotConnectedError without a refresh token', async () => {
    const { session } = setup({ refreshToken: null })
    await expect(session.getAccessToken()).rejects.toBeInstanceOf(
      NotConnectedError
    )
  })

  it('rejects API requests with the connect message when signed out', async () => {
    const { session, adapter } = setup({ refreshToken: null })
    const err = await session.http.get('https://example.test/a').catch(e => e)
    expect(err).toBeInstanceOf(NotConnectedError)
    expect(err.message).toBe('Connect Google in the desktop app')
    expect(adapter).not.toHaveBeenCalled()
  })

  it('attaches a bearer token and caches it', async () => {
    const { session, post } = setup()
    const res = await session.http.get('https://example.test/a')
    await session.http.get('https://example.test/b')
    expect(res.data).toEqual({ ok: true })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('shares one refresh between concurrent requests', async () => {
    const { session, post } = setup()
    await Promise.all([
      session.http.get('https://example.test/a'),
      session.http.get('https://example.test/b')
    ])
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('refreshes and retries once on 401', async () => {
    const { session, post, adapter } = setup()
    session.setAccessToken('stale-token', Number.MAX_SAFE_INTEGER)
    const res = await session.http.get('https://example.test/a')
    expect(res.status).toBe(200)
    expect(post).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('does not loop when the retry is also 401', async () => {
    const { session, adapter } = setup()
    adapter.mockImplementation(async config => {
      throw Object.assign(new Error('401'), {
        isAxiosError: true,
        config,
        response: respond(config, 401)
      })
    })
    await expect(session.http.get('https://example.test/a')).rejects.toThrow()
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('drops a revoked refresh token', async () => {
    const { session, post, setRefreshToken } = setup()
    post.mockResolvedValueOnce({
      status: 400,
      data: { error: 'invalid_grant' }
    })
    const err = await session.getAccessToken().catch(e => e)
    expect(err).toBeInstanceOf(NotConnectedError)
    expect(err.message).toBe(REVOKED)
    expect(setRefreshToken).toHaveBeenCalledWith(null)
  })
})
