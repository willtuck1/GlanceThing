import http from 'http'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-ins for storage.json and safeStorage. "Secure" values are
// stored with a prefix so tests can tell they went through encryption.
const store = vi.hoisted(() => new Map<string, unknown>())
const openExternal = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>())
const post = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ shell: { openExternal } }))
vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>()
  return { default: { ...actual.default, post } }
})
vi.mock('../utils.js', () => ({
  log: () => {},
  LogLevel: { WARN: 2 }
}))
vi.mock('../storage.js', () => ({
  getStorageValue: (key: string, secure = false) => {
    const value = store.get(key)
    if (value === undefined || value === null) return value ?? null
    return secure ? String(value).replace(/^enc:/, '') : value
  },
  setStorageValue: (key: string, value: unknown, secure = false) => {
    store.set(key, secure ? `enc:${value}` : value)
  }
}))

vi.stubGlobal('__GOOGLE_CLIENT_ID__', '')
vi.stubGlobal('__GOOGLE_CLIENT_SECRET__', '')

const auth = await import('./auth.js')

// Follows the auth URL like a browser would after consent: requests the
// loopback redirect with the given query.
function browserRedirect(query: (state: string) => string) {
  openExternal.mockImplementation(async url => {
    const u = new URL(url)
    const redirect = u.searchParams.get('redirect_uri')!
    const state = u.searchParams.get('state')!
    setTimeout(() => http.get(`${redirect}?${query(state)}`).on('error', () => {}))
  })
}

function get(url: string) {
  return new Promise<number>((resolve, reject) =>
    http
      .get(url, res => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      .on('error', reject)
  )
}

beforeEach(() => {
  store.clear()
  openExternal.mockReset()
  post.mockReset()
  auth.setGoogleClient('client-id', 'client-secret')
})

describe('setGoogleClient', () => {
  it('stores the secret securely and reports the source', () => {
    expect(store.get('googleClientSecret')).toBe('enc:client-secret')
    expect(auth.getGoogleStatus()).toEqual({
      configured: true,
      clientSource: 'settings',
      clientId: 'client-id',
      connected: false
    })
  })

  it('disconnects when the client changes', () => {
    store.set('googleRefreshToken', 'enc:r1')
    auth.setGoogleClient('client-id', 'rotated-secret')
    expect(auth.getGoogleStatus().connected).toBe(true)
    auth.setGoogleClient('other-id', 'other-secret')
    expect(auth.getGoogleStatus().connected).toBe(false)
  })

  it('clears to unconfigured', () => {
    auth.setGoogleClient('', '')
    expect(auth.getGoogleStatus()).toMatchObject({
      configured: false,
      clientSource: null
    })
  })
})

describe('connectGoogle', () => {
  it('runs the loopback flow and stores the refresh token securely', async () => {
    browserRedirect(state => `code=auth-code&state=${state}`)
    post.mockResolvedValue({
      status: 200,
      data: { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 }
    })

    await auth.connectGoogle()

    const authUrl = new URL(openExternal.mock.calls[0][0])
    expect(authUrl.searchParams.get('redirect_uri')).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/
    )
    const [, body] = post.mock.calls[0]
    const form = new URLSearchParams(body)
    expect(form.get('code')).toBe('auth-code')
    expect(form.get('redirect_uri')).toBe(
      authUrl.searchParams.get('redirect_uri')
    )
    expect(form.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(store.get('googleRefreshToken')).toBe('enc:r1')
    expect(auth.getGoogleStatus().connected).toBe(true)
  })

  it('ignores a callback with the wrong state and keeps waiting', async () => {
    let redirect = ''
    let state = ''
    openExternal.mockImplementation(async url => {
      const u = new URL(url)
      redirect = u.searchParams.get('redirect_uri')!
      state = u.searchParams.get('state')!
    })
    post.mockResolvedValue({
      status: 200,
      data: { access_token: 'a1', refresh_token: 'r1' }
    })

    const pending = auth.connectGoogle()
    await vi.waitFor(() => expect(redirect).not.toBe(''))

    expect(await get(`${redirect}?code=evil&state=wrong`)).toBe(400)
    expect(await get(`${redirect}?code=good&state=${state}`)).toBe(200)
    await pending

    expect(new URLSearchParams(post.mock.calls[0][1]).get('code')).toBe(
      'good'
    )
  })

  it('fails when the user denies consent', async () => {
    browserRedirect(state => `error=access_denied&state=${state}`)
    await expect(auth.connectGoogle()).rejects.toThrow('access_denied')
    expect(post).not.toHaveBeenCalled()
    expect(auth.getGoogleStatus().connected).toBe(false)
  })

  it('requires a client', async () => {
    auth.setGoogleClient('', '')
    await expect(auth.connectGoogle()).rejects.toThrow(
      'Add a Google OAuth client ID and secret first'
    )
  })
})

describe('disconnectGoogle', () => {
  it('clears the token locally and revokes it', async () => {
    store.set('googleRefreshToken', 'enc:r1')
    post.mockResolvedValue({ status: 200, data: {} })
    await auth.disconnectGoogle()
    expect(auth.getGoogleStatus().connected).toBe(false)
    expect(post.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/revoke')
    expect(new URLSearchParams(post.mock.calls[0][1]).get('token')).toBe('r1')
  })

  it('still disconnects when revoking fails', async () => {
    store.set('googleRefreshToken', 'enc:r1')
    post.mockRejectedValue(new Error('offline'))
    await auth.disconnectGoogle()
    expect(auth.getGoogleStatus().connected).toBe(false)
  })
})
