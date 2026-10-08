import axios, { AxiosError, AxiosInstance, CreateAxiosDefaults } from 'axios'

import { describeFetchError, FeedError, httpStatus } from '../feeds/errors.js'
import { GoogleClient, PostForm, refreshTokens, TokenError } from './oauth.js'

export const NOT_CONNECTED = 'Connect Google in the desktop app'
export const REVOKED =
  'Google access was revoked. Reconnect Google in the desktop app'
// Google answers 403 when the project doesn't have the API turned on, the
// most likely setup mistake.
export const FORBIDDEN =
  'Google refused access (403). Check the Calendar and Tasks APIs are enabled'

// Refresh this long before Google's stated expiry to avoid racing it.
const EXPIRY_MARGIN = 60_000

export class NotConnectedError extends Error {
  constructor(message = NOT_CONNECTED) {
    super(message)
    this.name = 'NotConnectedError'
  }
}

// Feed error for a failed Google request. Without a working account the
// cached events and tasks are dropped, so the tab shows how to reconnect.
export function describeGoogleError(e: unknown): FeedError {
  if (e instanceof NotConnectedError)
    return { message: e.message, dropItems: true }
  if (httpStatus(e) === 403)
    return { message: FORBIDDEN, dropItems: false }
  return describeFetchError(e, 'Google')
}

export interface SessionDeps {
  getClient: () => GoogleClient | null
  getRefreshToken: () => string | null
  setRefreshToken: (token: string | null) => void
  post: PostForm
  now?: () => number
  axiosConfig?: CreateAxiosDefaults
}

export interface GoogleSession {
  http: AxiosInstance
  getAccessToken: (force?: boolean) => Promise<string>
  setAccessToken: (token: string, expiresAt: number) => void
  reset: () => void
}

type RetriableConfig = NonNullable<AxiosError['config']> & {
  _googleRetried?: boolean
}

export function createGoogleSession(deps: SessionDeps): GoogleSession {
  const now = deps.now ?? Date.now
  let access: { token: string; expiresAt: number } | null = null
  let refreshing: Promise<string> | null = null

  async function refresh() {
    const client = deps.getClient()
    const refreshToken = deps.getRefreshToken()
    if (!client || !refreshToken) throw new NotConnectedError()

    try {
      const tokens = await refreshTokens(
        deps.post,
        client,
        refreshToken,
        now()
      )
      access = { token: tokens.accessToken, expiresAt: tokens.expiresAt }
      if (tokens.refreshToken && tokens.refreshToken !== refreshToken)
        deps.setRefreshToken(tokens.refreshToken)
      return tokens.accessToken
    } catch (e) {
      if (e instanceof TokenError && e.revoked) {
        deps.setRefreshToken(null)
        access = null
        throw new NotConnectedError(REVOKED)
      }
      throw e
    }
  }

  async function getAccessToken(force = false) {
    if (!force && access && access.expiresAt - EXPIRY_MARGIN > now())
      return access.token

    // Concurrent callers share one refresh request.
    if (!refreshing)
      refreshing = refresh().finally(() => {
        refreshing = null
      })
    return refreshing
  }

  const http = axios.create({ timeout: 10_000, ...deps.axiosConfig })

  http.interceptors.request.use(async config => {
    const token = await getAccessToken()
    config.headers.set('Authorization', `Bearer ${token}`)
    return config
  })

  // A 401 means the access token died early (e.g. revoked password change);
  // refresh once and retry, like the Spotify handler does.
  http.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined
    if (error.response?.status !== 401 || !config || config._googleRetried)
      throw error

    config._googleRetried = true
    access = null
    return http.request(config)
  })

  return {
    http,
    getAccessToken,
    setAccessToken(token, expiresAt) {
      access = { token, expiresAt }
    },
    reset() {
      access = null
    }
  }
}
