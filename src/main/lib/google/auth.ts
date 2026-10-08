import http from 'http'
import { AddressInfo } from 'net'
import axios from 'axios'
import { shell } from 'electron'

import { getStorageValue, setStorageValue } from '../storage.js'
import { log, LogLevel } from '../utils.js'
import {
  buildAuthUrl,
  createPkce,
  createState,
  exchangeCode,
  GoogleClient,
  parseCallback,
  PostForm,
  REVOKE_URL
} from './oauth.js'
import { createGoogleSession } from './session.js'

// Optional client baked in at build time from GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET. Empty unless the build environment sets them.
declare const __GOOGLE_CLIENT_ID__: string
declare const __GOOGLE_CLIENT_SECRET__: string

const CLIENT_ID_KEY = 'googleClientId'
const CLIENT_SECRET_KEY = 'googleClientSecret'
const REFRESH_TOKEN_KEY = 'googleRefreshToken'

const CONNECT_TIMEOUT = 5 * 60 * 1000

export type ClientSource = 'settings' | 'build' | null

export interface GoogleStatus {
  configured: boolean
  clientSource: ClientSource
  clientId: string
  connected: boolean
}

// Secure values are hex strings; null means "cleared". Read the raw value
// first so a cleared key is never passed to safeStorage.decryptString.
function getSecure(key: string): string | null {
  if (!getStorageValue(key)) return null
  const value = getStorageValue(key, true)
  return typeof value === 'string' && value ? value : null
}

function setSecure(key: string, value: string | null) {
  if (value) setStorageValue(key, value, true)
  else setStorageValue(key, null)
}

function getSettingsClient(): GoogleClient | null {
  const clientId = getStorageValue(CLIENT_ID_KEY)
  const clientSecret = getSecure(CLIENT_SECRET_KEY)
  if (typeof clientId !== 'string' || !clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

function getBuildClient(): GoogleClient | null {
  if (!__GOOGLE_CLIENT_ID__ || !__GOOGLE_CLIENT_SECRET__) return null
  return {
    clientId: __GOOGLE_CLIENT_ID__,
    clientSecret: __GOOGLE_CLIENT_SECRET__
  }
}

export function getGoogleClient(): GoogleClient | null {
  return getSettingsClient() ?? getBuildClient()
}

const postForm: PostForm = async (url, form) => {
  const res = await axios.post(url, new URLSearchParams(form).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10_000,
    validateStatus: () => true
  })
  return { status: res.status, data: res.data }
}

export const googleSession = createGoogleSession({
  getClient: getGoogleClient,
  getRefreshToken: () => getSecure(REFRESH_TOKEN_KEY),
  setRefreshToken: token => setSecure(REFRESH_TOKEN_KEY, token),
  post: postForm
})

export function getGoogleStatus(): GoogleStatus {
  const settings = getSettingsClient()
  const build = getBuildClient()
  const client = settings ?? build
  return {
    configured: client !== null,
    clientSource: settings ? 'settings' : build ? 'build' : null,
    clientId: client?.clientId ?? '',
    connected: getSecure(REFRESH_TOKEN_KEY) !== null
  }
}

// Saves a client from Settings. Empty values clear it, falling back to the
// build-time client. A refresh token is tied to the client that issued it,
// so changing the client disconnects the account.
export function setGoogleClient(clientId: string, clientSecret: string) {
  const id = clientId.trim()
  const secret = clientSecret.trim()
  const before = getGoogleClient()?.clientId ?? null

  setStorageValue(CLIENT_ID_KEY, id || null)
  setSecure(CLIENT_SECRET_KEY, id ? secret || null : null)

  if ((getGoogleClient()?.clientId ?? null) !== before) {
    setSecure(REFRESH_TOKEN_KEY, null)
    googleSession.reset()
  }
}

const RESPONSE_PAGE = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>GlanceThing</title>` +
  `<body style="font-family:sans-serif;background:#111;color:#eee;` +
  `display:flex;align-items:center;justify-content:center;height:90vh">` +
  `<p>${message}</p></body>`

let cancelPending: (() => void) | null = null

// Runs the desktop OAuth flow: a one-shot loopback server on a random port,
// PKCE, and the system browser for consent.
export async function connectGoogle(): Promise<void> {
  const client = getGoogleClient()
  if (!client) throw new Error('Add a Google OAuth client ID and secret first')

  cancelPending?.()

  const { verifier, challenge } = createPkce()
  const state = createState()
  const server = http.createServer()

  let redirectUri = ''

  const code = await new Promise<string>((resolve, reject) => {
    const finish = (err: Error | null, value?: string) => {
      clearTimeout(timer)
      cancelPending = null
      server.close()
      if (err) reject(err)
      else resolve(value!)
    }

    const timer = setTimeout(
      () => finish(new Error('Timed out waiting for Google sign-in')),
      CONNECT_TIMEOUT
    )
    cancelPending = () => finish(new Error('Sign-in was restarted'))

    server.on('request', (req, res) => {
      const result = parseCallback(req.url ?? '/', state)
      if (result.kind === 'ignore') {
        res.writeHead(404).end()
        return
      }

      const ok = result.kind === 'code'
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html' })
      res.end(
        RESPONSE_PAGE(
          ok
            ? 'Google connected. You can close this tab.'
            : 'Google sign-in failed. You can close this tab and try again.'
        )
      )

      if (result.kind === 'code') finish(null, result.code)
      else finish(new Error(`Google sign-in failed: ${result.error}`))
    })

    server.on('error', err => finish(err))

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      redirectUri = `http://127.0.0.1:${port}/callback`
      shell
        .openExternal(
          buildAuthUrl({
            clientId: client.clientId,
            redirectUri,
            challenge,
            state
          })
        )
        .catch(err => finish(err))
    })
  })

  const tokens = await exchangeCode(
    postForm,
    client,
    code,
    verifier,
    redirectUri
  )
  if (!tokens.refreshToken)
    throw new Error('Google did not return a refresh token')

  setSecure(REFRESH_TOKEN_KEY, tokens.refreshToken)
  googleSession.setAccessToken(tokens.accessToken, tokens.expiresAt)
  log('Google account connected', 'Google')
}

export async function disconnectGoogle() {
  const refreshToken = getSecure(REFRESH_TOKEN_KEY)
  setSecure(REFRESH_TOKEN_KEY, null)
  googleSession.reset()

  if (refreshToken) {
    // Best effort: the token is gone locally either way.
    await postForm(REVOKE_URL, { token: refreshToken }).catch(err =>
      log(`Failed to revoke Google token: ${err}`, 'Google', LogLevel.WARN)
    )
  }
  log('Google account disconnected', 'Google')
}
