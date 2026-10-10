// Pure helpers for the MCP connector form. No DOM, no window.api.
import { MAX_INTERVAL, MIN_INTERVAL } from './connectorForm.js'

type Api = Window['api']
export type McpConnectorRow = Extract<
  Awaited<ReturnType<Api['listConnectors']>>[number],
  { source: { kind: 'mcp' } }
>
export type McpDraft = Extract<
  Parameters<Api['saveConnector']>[0],
  { kind: 'mcp' }
>
export type McpRecipe = Awaited<ReturnType<Api['listMcpRecipes']>>[number]
export type McpAuth = McpConnectorRow['auth']

export interface McpForm {
  id?: string
  recipeId: string
  serverUrl: string
  label: string
  intervalMin: string
  settings: Record<string, string>
  // A newly typed client ID; never prefilled.
  clientId: string
  // What is stored on the host.
  clientIdSet: boolean
  clientIdHint: string
  clientIdCleared: boolean
  clientIdReplacing: boolean
}

export function emptyMcpForm(): McpForm {
  return {
    recipeId: '',
    serverUrl: '',
    label: '',
    intervalMin: '',
    settings: {},
    clientId: '',
    clientIdSet: false,
    clientIdHint: '',
    clientIdCleared: false,
    clientIdReplacing: false
  }
}

// Picking a recipe: fills the server URL only if empty; label and
// interval only if empty or still the previous recipe's default.
export function applyRecipe(
  f: McpForm,
  recipe: McpRecipe,
  previous?: McpRecipe
): McpForm {
  return {
    ...f,
    recipeId: recipe.id,
    serverUrl: f.serverUrl.trim()
      ? f.serverUrl
      : (recipe.defaultServerUrl ?? ''),
    label:
      !f.label.trim() || f.label === previous?.label
        ? recipe.label
        : f.label,
    intervalMin:
      !f.intervalMin.trim() ||
      f.intervalMin === String(previous?.intervalMin)
        ? String(recipe.intervalMin)
        : f.intervalMin,
    settings: {}
  }
}

export function formFromMcpConnector(c: McpConnectorRow): McpForm {
  return {
    id: c.id,
    recipeId: c.source.recipeId,
    serverUrl: c.source.serverUrl,
    label: c.label,
    intervalMin: String(c.intervalMin),
    settings: { ...(c.source.settings ?? {}) },
    clientId: '',
    clientIdSet: c.clientIdSet,
    clientIdHint: c.clientIdHint ?? '',
    clientIdCleared: false,
    clientIdReplacing: false
  }
}

export function validateMcpForm(
  f: McpForm,
  recipe: McpRecipe | undefined
): string[] {
  const errors: string[] = []
  if (!recipe) errors.push('Choose a recipe')
  if (!f.label.trim()) errors.push('Name is required')
  if (!f.serverUrl.trim()) errors.push('Server URL is required')
  else if (!/^https?:\/\//i.test(f.serverUrl.trim()))
    errors.push('Server URL must start with https://')
  if (f.intervalMin.trim()) {
    const n = Number(f.intervalMin)
    if (!Number.isInteger(n) || n < MIN_INTERVAL || n > MAX_INTERVAL)
      errors.push(
        `Refresh interval must be ${MIN_INTERVAL}-${MAX_INTERVAL} minutes`
      )
  }
  return errors
}

// undefined = keep, null = clear, string = set.
export function clientIdFromForm(f: McpForm): string | null | undefined {
  const typed = f.clientId.trim()
  if (typed) return typed
  if (f.clientIdCleared) return null
  return undefined
}

export function mcpDraftFromForm(f: McpForm): McpDraft {
  const settings: Record<string, string> = {}
  for (const [k, v] of Object.entries(f.settings)) {
    const t = v.trim()
    if (t) settings[k] = t
  }
  const draft: McpDraft = {
    kind: 'mcp',
    recipeId: f.recipeId,
    serverUrl: f.serverUrl.trim(),
    label: f.label.trim()
  }
  if (f.id) draft.id = f.id
  if (f.intervalMin.trim()) draft.intervalMin = Number(f.intervalMin)
  if (Object.keys(settings).length > 0) draft.settings = settings
  const clientId = clientIdFromForm(f)
  if (clientId !== undefined) draft.clientId = clientId
  return draft
}

export type BadgeVariant = 'ok' | 'warn' | 'muted'

export function authBadge(auth: McpAuth): {
  text: string
  variant: BadgeVariant
} {
  switch (auth) {
    case 'signedIn':
      return { text: 'Signed in', variant: 'ok' }
    case 'expired':
      return {
        text: 'Sign-in expired — sign in again',
        variant: 'warn'
      }
    case 'notRequired':
      return { text: 'No sign-in needed', variant: 'muted' }
    default:
      return { text: 'Not signed in', variant: 'muted' }
  }
}

export function canSignIn(auth: McpAuth): boolean {
  return auth === 'signedOut' || auth === 'expired'
}

export function canSignOut(auth: McpAuth): boolean {
  return auth === 'signedIn'
}

// Host only; never the path or query.
export function serverHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
