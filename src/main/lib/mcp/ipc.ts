// Desktop Settings IPC for MCP connectors: the recipe catalogue, sign-in and
// sign-out. Nothing here returns or throws a token, verifier or client
// registration; sign-in errors are the fixed strings from signIn.ts.

import { shell } from 'electron'

import { signIn } from './auth/signIn.js'
import { signOut } from './auth/store.js'
import { listRecipes, RecipeSetting } from './recipes.js'

import type { Layout } from '../connectors/types.js'

export interface McpRecipeInfo {
  id: string
  label: string
  description: string
  defaultServerUrl?: string
  layout: Layout
  source: 'tool' | 'resource'
  settings: RecipeSetting[]
  intervalMin: number
}

// Never the tool arguments or the mapping.
export function ipcListMcpRecipes(): McpRecipeInfo[] {
  return listRecipes().map(r => ({
    id: r.id,
    label: r.label,
    description: r.description,
    ...(r.defaultServerUrl
      ? { defaultServerUrl: r.defaultServerUrl }
      : {}),
    layout: r.layout,
    source: r.tool ? 'tool' : 'resource',
    settings: r.settings.map(s => ({
      key: s.key,
      label: s.label,
      ...(s.placeholder !== undefined
        ? { placeholder: s.placeholder }
        : {}),
      maxLength: s.maxLength
    })),
    intervalMin: r.intervalMin
  }))
}

// Never rejects.
export async function ipcMcpSignIn(
  id: unknown
): Promise<{ ok: true } | { error: string }> {
  try {
    if (typeof id !== 'string') return { error: 'Connector not found' }
    return await signIn(id, {
      openExternal: url => shell.openExternal(url)
    })
  } catch {
    return { error: 'Sign-in failed' }
  }
}

export function ipcMcpSignOut(id: unknown): boolean {
  try {
    if (typeof id !== 'string') return false
    signOut(id)
    return true
  } catch {
    return false
  }
}
