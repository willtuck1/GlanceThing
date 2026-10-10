// Runs an MCP connector: one committed recipe (a read-only tool call or a
// resource read) against the connector's server, mapped onto a B layout.
// Set as the feed runner with setMcpRunner (setup/feeds.ts). Errors are short
// fixed strings or McpRunError messages: never URLs, tokens or raw bodies.
// Nothing here logs.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { ConnectorFetchError } from '../connectors/hop.js'
import { applyMapping } from '../connectors/mapping.js'
import { safeFetch } from '../connectors/safeFetch.js'
import { connectorRevision } from '../connectors/store.js'
import { Connector, ConnectorView } from '../connectors/types.js'

import { resolveArgs } from './args.js'
import { McpAuthRequiredError, createProvider } from './auth/provider.js'
import { ensureFresh } from './auth/signIn.js'
import { AuthState, authState, readTokens } from './auth/store.js'
import { assertReadOnlyTool, McpRunError } from './guard.js'
import { getRecipe } from './recipes.js'
import { resourceResultData, toolResultData } from './result.js'

export const RUN_BUDGET_MS = 30_000
const CLIENT_INFO = { name: 'GlanceThing', version: '1.0.0' }

export const SIGN_IN_AGAIN =
  'Signed out or login expired: sign in again in Settings'
export const SECRET_IN_VIEW = 'Response contained a secret; not shown'
const UNREACHABLE = "Couldn't reach the MCP server"

export type McpAuthStatus = AuthState | 'notRequired'

export interface RunOptions {
  now?: Date
  timeZone?: string
  // Tests only.
  budgetMs?: number
}

// Connector id → revision at which a run succeeded with no stored tokens.
const noAuthOk = new Map<string, number>()

export function authStatus(id: string): McpAuthStatus {
  const state = authState(id)
  if (state !== 'signedOut') return state
  const rev = noAuthOk.get(id)
  if (rev === undefined) return state
  if (rev !== connectorRevision(id)) {
    noAuthOk.delete(id)
    return state
  }
  return 'notRequired'
}

function storedSecrets(id: string): string[] {
  const t = readTokens(id)?.tokens
  return [t?.access_token, t?.refresh_token].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  )
}

export function assertNoTokens(view: unknown, secrets: string[]): void {
  const text = JSON.stringify(view)
  if (secrets.some(s => s && text.includes(s)))
    throw new McpRunError(SECRET_IN_VIEW)
}

function findCause<T>(
  e: unknown,
  type: abstract new (...args: never[]) => T
): T | null {
  for (let x = e, i = 0; x && i < 5; i++) {
    if (x instanceof type) return x
    x = (x as { cause?: unknown }).cause
  }
  return null
}

function readableError(e: unknown, secrets: string[]): Error {
  let message = UNREACHABLE
  if (
    findCause(e, UnauthorizedError) ||
    findCause(e, McpAuthRequiredError)
  )
    message = SIGN_IN_AGAIN
  else if (e instanceof McpRunError) message = e.message
  else {
    const fetchError = findCause(e, ConnectorFetchError)
    if (fetchError?.message) message = fetchError.message
  }
  if (secrets.some(s => message.includes(s))) message = UNREACHABLE
  return new McpRunError(message)
}

async function execute(
  c: Connector,
  client: Client,
  opts: RunOptions,
  isAborted: () => boolean
): Promise<ConnectorView> {
  if (c.source.kind !== 'mcp')
    throw new McpRunError('Not an MCP connector')
  const recipe = getRecipe(c.source.recipeId)
  if (!recipe) throw new McpRunError('Recipe no longer available')

  await ensureFresh(c.id)
  if (isAborted()) throw new McpRunError('Timed out')

  const transport = new StreamableHTTPClientTransport(
    new URL(c.source.serverUrl),
    {
      authProvider: createProvider(c.id, { mode: 'background' }),
      fetch: safeFetch
    }
  )
  await client.connect(transport)

  let data: unknown
  if (recipe.tool) {
    await assertReadOnlyTool(client, recipe.tool.name)
    if (isAborted()) throw new McpRunError('Timed out')
    const args = resolveArgs(
      recipe.tool.args,
      c.source.settings ?? {},
      opts.now ?? new Date(),
      opts.timeZone
    )
    data = toolResultData(
      await client.callTool({ name: recipe.tool.name, arguments: args })
    )
  } else if (recipe.resource) {
    data = resourceResultData(
      await client.readResource({ uri: recipe.resource.uri })
    )
  } else {
    throw new McpRunError('Recipe no longer available')
  }
  // Mapping paths can't be empty, so plain text is mapped as `{ text }`.
  if (typeof data === 'string') data = { text: data }
  // The recipe's own layout and mapping (validated when recipes load).
  return applyMapping(recipe.layout, recipe.mapping, data)
}

export async function runMcp(
  c: Connector,
  opts: RunOptions = {}
): Promise<ConnectorView> {
  const before = storedSecrets(c.id)
  const rev = connectorRevision(c.id)
  const client = new Client(CLIENT_INFO)
  let timer: ReturnType<typeof setTimeout> | undefined
  let aborted = false
  try {
    const work = execute(c, client, opts, () => aborted)
    work.catch(() => {})
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        aborted = true
        reject(new McpRunError('Timed out'))
      }, opts.budgetMs ?? RUN_BUDGET_MS)
    })
    const view = await Promise.race([work, deadline])
    // Tokens may have been refreshed during the run: check old and new.
    const after = storedSecrets(c.id)
    assertNoTokens(view, [...before, ...after])
    if (before.length === 0 && after.length === 0) noAuthOk.set(c.id, rev)
    else noAuthOk.delete(c.id)
    return view
  } catch (e) {
    noAuthOk.delete(c.id)
    throw readableError(e, [...before, ...storedSecrets(c.id)])
  } finally {
    if (timer) clearTimeout(timer)
    try {
      await client.close()
    } catch {
      // Closing a half-open connection must not mask the result.
    }
  }
}

// Settings → Test: the same run, but never rejects.
export async function testMcpConnector(
  c: Connector,
  opts: RunOptions = {}
): Promise<{ view: ConnectorView } | { error: string }> {
  try {
    return { view: await runMcp(c, opts) }
  } catch (e) {
    return {
      error: e instanceof Error && e.message ? e.message : UNREACHABLE
    }
  }
}
