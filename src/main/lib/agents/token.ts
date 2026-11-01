// Bearer token for the local agents listener (127.0.0.1). Stored in secure
// storage under `agentsToken`; the generic storage IPC refuses the key
// (`isProtectedStorageKey` in connectors/store.ts). This module logs nothing
// and never puts the token in an error.
//
// If safeStorage encryption is unavailable, storage.ts stores the value as
// plaintext with a warning. Accepted: the token only guards against local
// processes spoofing agent cards.
//
// Imports only storage.ts so connectors/store.ts can import the key without
// an import cycle.

import { randomBytes, timingSafeEqual } from 'node:crypto'

import { getStorageValue, setStorageValue } from '../storage.js'

export const AGENTS_TOKEN_KEY = 'agentsToken'

const TOKEN_RE = /^[0-9a-f]{64}$/
const HEADER_RE = /^[Bb][Ee][Aa][Rr][Ee][Rr] ([0-9a-f]{64})$/

// Cached so a request doesn't decrypt the stored value each time.
let cached: string | null = null

function readStored(): string | null {
  try {
    const value = getStorageValue(AGENTS_TOKEN_KEY, true)
    return typeof value === 'string' && TOKEN_RE.test(value) ? value : null
  } catch {
    return null
  }
}

export function regenerateAgentsToken(): string {
  const token = randomBytes(32).toString('hex')
  setStorageValue(AGENTS_TOKEN_KEY, token, true)
  cached = token
  return token
}

export function getAgentsToken(): string {
  if (cached) return cached
  const stored = readStored()
  if (stored) {
    cached = stored
    return stored
  }
  return regenerateAgentsToken()
}

// `authorizationHeader` must be exactly `Bearer <64 hex>` (scheme in any
// case, one space). Constant-time comparison; never throws.
export function tokenMatches(
  authorizationHeader: unknown,
  expected: string
): boolean {
  try {
    if (typeof authorizationHeader !== 'string') return false
    if (typeof expected !== 'string') return false
    const m = HEADER_RE.exec(authorizationHeader)
    if (!m) return false
    const a = Buffer.from(m[1], 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// Test-only: forget the cached token.
export function _resetAgentsTokenCache(): void {
  cached = null
}
