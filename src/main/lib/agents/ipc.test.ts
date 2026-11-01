import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  token: 'a'.repeat(64),
  n: 0,
  status: { running: true, port: 47900 as number | null } as {
    running: boolean
    port: number | null
    error?: string
  }
}))

vi.mock('../setup/agents.js', () => ({
  AGENTS_DEFAULT_PORT: 47816,
  getListenerStatus: () => state.status
}))
vi.mock('./token.js', () => ({
  getAgentsToken: () => state.token,
  regenerateAgentsToken: () => {
    state.n += 1
    state.token = String(state.n % 10)
      .repeat(64)
      .replace(/^./, 'b')
    return state.token
  }
}))

import {
  ipcGetAgentsSettings,
  ipcGetAgentsSnippet,
  ipcGetAgentsToken,
  ipcRegenerateAgentsToken
} from './ipc.js'

beforeEach(() => {
  state.token = 'a'.repeat(64)
  state.n = 0
  state.status = { running: true, port: 47900 }
})

describe('getAgentsSettings', () => {
  it('lists listener status and adapters without the token', () => {
    const s = ipcGetAgentsSettings()
    expect(s.listener).toEqual({ running: true, port: 47900 })
    expect(s.adapters.map(a => a.id)).toContain('claude-code')
    const text = JSON.stringify(s)
    expect(text).not.toContain(state.token)
    expect(text).not.toMatch(/[0-9a-f]{64}/)
  })

  it('passes the listener error through', () => {
    state.status = { running: false, port: null, error: 'Port in use' }
    expect(ipcGetAgentsSettings().listener).toEqual({
      running: false,
      port: null,
      error: 'Port in use'
    })
  })
})

describe('getAgentsSnippet', () => {
  it('returns null for unknown ids and non-strings', () => {
    expect(ipcGetAgentsSnippet('nope')).toBeNull()
    expect(ipcGetAgentsSnippet('')).toBeNull()
    expect(ipcGetAgentsSnippet(undefined)).toBeNull()
    expect(ipcGetAgentsSnippet(42)).toBeNull()
    expect(ipcGetAgentsSnippet({ id: 'custom' })).toBeNull()
  })

  it("'custom' contains the token and port", () => {
    const s = ipcGetAgentsSnippet('custom')!
    expect(s).toContain(state.token)
    expect(s).toContain('127.0.0.1:47900')
  })

  it("'claude-code' contains the token", () => {
    const s = ipcGetAgentsSnippet('claude-code')!
    expect(s).toContain(state.token)
    expect(s).toContain('47900')
  })

  it('falls back to the default port when the listener is down', () => {
    state.status = { running: false, port: null }
    expect(ipcGetAgentsSnippet('custom')).toContain('127.0.0.1:47816')
  })
})

describe('tokens', () => {
  it('returns the token', () => {
    expect(ipcGetAgentsToken()).toBe(state.token)
  })

  it('regenerate returns a new token and later snippets use it', () => {
    const before = ipcGetAgentsToken()
    const next = ipcRegenerateAgentsToken()
    expect(next).not.toBe(before)
    expect(next).toMatch(/^[0-9a-f]{64}$/)
    const s = ipcGetAgentsSnippet('custom')!
    expect(s).toContain(next)
    expect(s).not.toContain(before)
    expect(ipcGetAgentsSnippet('claude-code')).toContain(next)
  })
})
