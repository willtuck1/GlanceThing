import { describe, expect, it } from 'vitest'

import {
  McpRecipe,
  applyRecipe,
  authBadge,
  canSignIn,
  canSignOut,
  emptyMcpForm,
  mcpDraftFromForm,
  serverHost,
  validateMcpForm
} from './mcpForm.js'

const recipe: McpRecipe = {
  id: 'r1',
  label: 'Recipe',
  description: 'd',
  defaultServerUrl: 'https://mcp.example.com/mcp',
  layout: 'list',
  source: 'tool',
  settings: [],
  intervalMin: 30
}

function filled() {
  return {
    ...emptyMcpForm(),
    recipeId: 'r1',
    serverUrl: ' https://mcp.example.com/mcp ',
    label: ' Mine '
  }
}

describe('mcpDraftFromForm', () => {
  it('trims and omits empty settings and interval', () => {
    const d = mcpDraftFromForm({
      ...filled(),
      settings: { a: ' x ', b: '  ' }
    })
    expect(d).toEqual({
      kind: 'mcp',
      recipeId: 'r1',
      serverUrl: 'https://mcp.example.com/mcp',
      label: 'Mine',
      settings: { a: 'x' }
    })
  })

  it('includes id and interval', () => {
    const d = mcpDraftFromForm({
      ...filled(),
      id: 'abc12345',
      intervalMin: '5'
    })
    expect(d.id).toBe('abc12345')
    expect(d.intervalMin).toBe(5)
    expect(d.settings).toBeUndefined()
  })

  it('clientId: undefined when empty and unchanged', () => {
    const d = mcpDraftFromForm({ ...filled(), clientIdSet: true })
    expect('clientId' in d).toBe(false)
  })

  it('clientId: null when cleared', () => {
    expect(
      mcpDraftFromForm({ ...filled(), clientIdCleared: true }).clientId
    ).toBeNull()
  })

  it('clientId: string when typed (wins over cleared)', () => {
    expect(
      mcpDraftFromForm({
        ...filled(),
        clientId: ' id-1 ',
        clientIdCleared: true
      }).clientId
    ).toBe('id-1')
  })
})

describe('validateMcpForm', () => {
  it('accepts a good form', () => {
    expect(validateMcpForm(filled(), recipe)).toEqual([])
  })
  it('reports problems', () => {
    expect(validateMcpForm(emptyMcpForm(), undefined)).toHaveLength(3)
    expect(
      validateMcpForm({ ...filled(), intervalMin: '0' }, recipe)
    ).toHaveLength(1)
  })
})

describe('applyRecipe', () => {
  it('fills defaults only when empty', () => {
    const f = applyRecipe(emptyMcpForm(), recipe)
    expect(f.serverUrl).toBe('https://mcp.example.com/mcp')
    expect(f.label).toBe('Recipe')
    expect(f.intervalMin).toBe('30')
    const g = applyRecipe(
      { ...emptyMcpForm(), serverUrl: 'https://x.test', label: 'Mine' },
      recipe
    )
    expect(g.serverUrl).toBe('https://x.test')
    expect(g.label).toBe('Mine')
  })
})

describe('authBadge', () => {
  it('maps all four states', () => {
    expect(authBadge('signedIn')).toEqual({
      text: 'Signed in',
      variant: 'ok'
    })
    expect(authBadge('expired')).toEqual({
      text: 'Sign-in expired — sign in again',
      variant: 'warn'
    })
    expect(authBadge('signedOut')).toEqual({
      text: 'Not signed in',
      variant: 'muted'
    })
    expect(authBadge('notRequired')).toEqual({
      text: 'No sign-in needed',
      variant: 'muted'
    })
  })
  it('chooses buttons', () => {
    expect(canSignIn('signedOut')).toBe(true)
    expect(canSignIn('expired')).toBe(true)
    expect(canSignIn('signedIn')).toBe(false)
    expect(canSignIn('notRequired')).toBe(false)
    expect(canSignOut('signedIn')).toBe(true)
    expect(canSignOut('expired')).toBe(false)
  })
})

describe('serverHost', () => {
  it('shows host only', () => {
    expect(serverHost('https://mcp.example.com:8443/a/b?token=1')).toBe(
      'mcp.example.com:8443'
    )
  })
  it('is empty for invalid', () => {
    expect(serverHost('nope')).toBe('')
  })
})
