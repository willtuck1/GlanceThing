// Secure per-connector OAuth state for MCP connectors. Every value lives in
// secure storage (Electron safeStorage) under `mcpAuth.<id>.*`:
//   tokens   = JSON { tokens?: OAuthTokens, savedAt, expired? }
//   client   = JSON { manualClientId?, info?: OAuthClientInformationFull }
//   verifier = PKCE code verifier (only during a sign-in)
// Writes are refused when OS encryption is unavailable, so nothing is ever
// stored in plaintext. Nothing here logs.

import type {
  OAuthClientInformationFull,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { safeStorage } from 'electron'

import {
  bumpConnectorRevision,
  getConnector,
  MCP_AUTH_PREFIX
} from '../../connectors/store.js'
import {
  deleteStorageValue,
  getStorageValue,
  setStorageValue
} from '../../storage.js'

export type AuthState = 'signedIn' | 'expired' | 'signedOut'

export interface StoredTokens {
  // Absent once a background refresh failed (expired is then true).
  tokens?: OAuthTokens
  savedAt: number
  expired?: boolean
}

export interface StoredClient {
  manualClientId?: string
  info?: OAuthClientInformationFull
}

export const SECURE_STORAGE_UNAVAILABLE =
  'Secure storage unavailable on this system'

const ID_RE = /^[a-z0-9]{8}$/
const CLIENT_ID_RE = /^[\x20-\x7e]{1,200}$/

type Part = 'tokens' | 'client' | 'verifier'

export function authKey(id: string, part: Part): string {
  if (!ID_RE.test(id)) throw new Error('Connector not found')
  return `${MCP_AUTH_PREFIX}${id}.${part}`
}

// Tests replace this through the mocked `electron` module.
export function isSecureStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable() === true
  } catch {
    return false
  }
}

export function assertSecureStorage(): void {
  if (!isSecureStorageAvailable())
    throw new Error(SECURE_STORAGE_UNAVAILABLE)
}

export const clock = { now: (): number => Date.now() }

function readJson<T>(id: string, part: Part): T | null {
  try {
    const raw = getStorageValue(authKey(id, part), true)
    if (typeof raw !== 'string' || !raw) return null
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as T)
      : null
  } catch {
    return null
  }
}

function writeSecure(id: string, part: Part, value: string): void {
  assertSecureStorage()
  setStorageValue(authKey(id, part), value, true)
}

export function readTokens(id: string): StoredTokens | null {
  const t = readJson<StoredTokens>(id, 'tokens')
  if (!t || typeof t.savedAt !== 'number') return null
  if (t.tokens && typeof t.tokens.access_token !== 'string') return null
  return t
}

export function writeTokens(id: string, value: StoredTokens): void {
  writeSecure(id, 'tokens', JSON.stringify(value))
}

export function deleteTokens(id: string): void {
  deleteStorageValue(authKey(id, 'tokens'))
}

// Keeps the fact that the user had signed in, but drops the dead tokens.
export function markExpired(id: string): void {
  const t = readTokens(id)
  if (!t) return
  try {
    writeTokens(id, { savedAt: t.savedAt, expired: true })
  } catch {
    // Without secure storage the tokens can't be rewritten; drop them.
    deleteTokens(id)
  }
}

export function readClient(id: string): StoredClient {
  const c = readJson<StoredClient>(id, 'client') ?? {}
  const out: StoredClient = {}
  if (
    typeof c.manualClientId === 'string' &&
    CLIENT_ID_RE.test(c.manualClientId)
  )
    out.manualClientId = c.manualClientId
  if (c.info && typeof c.info.client_id === 'string') out.info = c.info
  return out
}

function writeClient(id: string, c: StoredClient): void {
  if (!c.manualClientId && !c.info) {
    deleteStorageValue(authKey(id, 'client'))
    return
  }
  writeSecure(id, 'client', JSON.stringify(c))
}

export function saveClientInfo(
  id: string,
  info: OAuthClientInformationFull
): void {
  writeClient(id, { ...readClient(id), info })
}

export function forgetClientInfo(id: string): void {
  const c = readClient(id)
  if (!c.info) return
  if (c.manualClientId)
    writeClient(id, { manualClientId: c.manualClientId })
  else deleteStorageValue(authKey(id, 'client'))
}

export function readVerifier(id: string): string | null {
  try {
    const v = getStorageValue(authKey(id, 'verifier'), true)
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

export function writeVerifier(id: string, verifier: string): void {
  writeSecure(id, 'verifier', verifier)
}

export function deleteVerifier(id: string): void {
  deleteStorageValue(authKey(id, 'verifier'))
}

// ms timestamp after which the access token is no longer valid, or null when
// the server gave no lifetime.
export function accessExpiresAt(t: StoredTokens): number | null {
  const sec = t.tokens?.expires_in
  return typeof sec === 'number' && Number.isFinite(sec)
    ? t.savedAt + sec * 1000
    : null
}

export function authState(id: string): AuthState {
  const t = readTokens(id)
  if (!t) return 'signedOut'
  if (t.expired || !t.tokens) return 'expired'
  const exp = accessExpiresAt(t)
  if (exp !== null && exp <= clock.now() && !t.tokens.refresh_token)
    return 'expired'
  return 'signedIn'
}

function assertMcpConnector(id: string): void {
  const c = typeof id === 'string' ? getConnector(id) : null
  if (!c || c.source.kind !== 'mcp') throw new Error('Connector not found')
}

export function getManualClientId(id: string): string | null {
  return readClient(id).manualClientId ?? null
}

// Changing the id (or clearing it) drops tokens and any DCR registration,
// since both belong to the old client.
export function setManualClientId(
  id: string,
  clientId: string | null
): void {
  assertMcpConnector(id)
  let next: string | undefined
  if (clientId !== null) {
    const v = typeof clientId === 'string' ? clientId.trim() : ''
    if (!CLIENT_ID_RE.test(v))
      throw new Error('Client ID must be 1–200 printable characters')
    next = v
  }
  const current = readClient(id)
  if (current.manualClientId === next) return
  if (next !== undefined) assertSecureStorage()
  deleteTokens(id)
  deleteVerifier(id)
  writeClient(id, { manualClientId: next })
  bumpConnectorRevision(id)
}

// Removes tokens, verifier and the DCR registration; keeps the manual client id.
export function signOut(id: string): void {
  authKey(id, 'tokens')
  deleteTokens(id)
  deleteVerifier(id)
  const manual = readClient(id).manualClientId
  if (manual) {
    try {
      writeClient(id, { manualClientId: manual })
    } catch {
      deleteStorageValue(authKey(id, 'client'))
    }
  } else deleteStorageValue(authKey(id, 'client'))
  bumpConnectorRevision(id)
}

// The server moved: tokens and the DCR registration belong to the old one.
// signOut already forgets the registration; kept separate so callers say why.
export function clearAuthOnOriginChange(id: string): void {
  signOut(id)
}
