// Validation of MCP connector drafts (Settings save/test). The layout and
// mapping always come from the recipe; the draft only picks the recipe, the
// server URL and the recipe's declared settings. Logs nothing.

import { getRecipe } from '../mcp/recipes.js'

import { Connector, McpSource } from './types.js'
import {
  validateInterval,
  validateLabel,
  validateUrl
} from './validate.js'

export interface McpDraft {
  id?: string
  kind: 'mcp'
  label: string
  intervalMin?: number
  recipeId: string
  serverUrl: string
  settings?: Record<string, string>
  // undefined = keep, null = clear, string = set a manual OAuth client ID.
  clientId?: string | null
}

const CLIENT_ID_RE = /^[\x20-\x7e]{1,200}$/

export function isMcpDraft(draft: unknown): boolean {
  return (
    !!draft &&
    typeof draft === 'object' &&
    (draft as { kind?: unknown }).kind === 'mcp'
  )
}

// `id` of the result is the existing id, or '' for a new connector.
// `clientId`: undefined = keep, null = clear, string = trimmed new value.
export function validateMcpDraft(
  draft: unknown,
  existing?: Connector
): { connector: Connector; clientId: string | null | undefined } {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft))
    throw new Error('Invalid connector')
  const d = draft as Record<string, unknown>
  if (existing && existing.source.kind !== 'mcp')
    throw new Error("A connector can't change type")

  const recipe =
    typeof d.recipeId === 'string' ? getRecipe(d.recipeId) : undefined
  if (!recipe) throw new Error('Unknown recipe')

  const label = validateLabel(d.label)
  const serverUrl = validateUrl(d.serverUrl).href
  const intervalMin = validateInterval(
    d.intervalMin === undefined ? recipe.intervalMin : d.intervalMin
  )

  const rawSettings = d.settings
  if (
    rawSettings !== undefined &&
    rawSettings !== null &&
    (typeof rawSettings !== 'object' || Array.isArray(rawSettings))
  )
    throw new Error('Invalid settings')
  const settings: Record<string, string> = {}
  for (const [key, value] of Object.entries(
    (rawSettings ?? {}) as Record<string, unknown>
  )) {
    const def = recipe.settings.find(s => s.key === key)
    if (!def) throw new Error('Unknown setting')
    if (typeof value !== 'string')
      throw new Error(`${def.label} is invalid`)
    const v = value.trim()
    if (v.length > def.maxLength)
      throw new Error(`${def.label} is too long`)
    if (v) settings[key] = v
  }

  let clientId: string | null | undefined
  if (d.clientId === undefined) clientId = undefined
  else if (d.clientId === null) clientId = null
  else {
    const v = typeof d.clientId === 'string' ? d.clientId.trim() : ''
    if (!v) clientId = null
    else if (!CLIENT_ID_RE.test(v))
      throw new Error('Client ID must be 1–200 printable characters')
    else clientId = v
  }

  const source: McpSource = {
    kind: 'mcp',
    recipeId: recipe.id,
    serverUrl,
    ...(Object.keys(settings).length ? { settings } : {})
  }
  return {
    connector: {
      id: existing?.id ?? '',
      label,
      layout: recipe.layout,
      mapping: recipe.mapping,
      intervalMin,
      source
    },
    clientId
  }
}
