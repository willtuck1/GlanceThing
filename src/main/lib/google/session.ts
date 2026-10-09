import axios, { AxiosError, AxiosInstance, CreateAxiosDefaults } from 'axios'

import { GoogleClient, PostForm, refreshTokens, TokenError } from './oauth.js'

export const NOT_CONFIGURED = "Set up Google in the desktop app's Settings"
export const NOT_CONNECTED = 'Connect Google in the desktop app'
export const REVOKED =
  'Google access was revoked. Reconnect Google in the desktop app'

// Refresh this long before Google's stated expiry to avoid racing it.
const EXPIRY_MARGIN = 60_000

export class NotConnectedError extends Error {
  constructor(message = NOT_CONNECTED) {
    super(message)
    this.name = 'NotConnectedError'
  }
}

export interface SessionDeps {
  getClient: () => GoogleClient | null
  getRefreshToken: () => string | null
  setRefreshToken: (token: string | null) => void
  // Remembers that Google revoked the last token, so the tabs keep asking
  // to reconnect rather than to connect.
  isRevoked?: () => boolean
  setRevoked?: (revoked: boolean) => void
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
    if (!client) throw new NotConnectedError(NOT_CONFIGURED)
    if (!refreshToken)
      throw new NotConnectedError(
        deps.isRevoked?.() ? REVOKED : NOT_CONNECTED
      )

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
        deps.setRevoked?.(true)
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
