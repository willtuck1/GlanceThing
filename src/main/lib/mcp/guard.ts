// Refuses any tool the server does not mark read-only (annotations.readOnlyHint
// === true). Runs before every tool call. Pure: takes anything with listTools.

export const MAX_TOOL_PAGES = 20
export const MAX_TOOLS = 1000

// Errors from the guard, result parsing and recipe lookup: short, readable
// and free of URLs, tokens and raw bodies, so they can be shown as-is.
export class McpRunError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpRunError'
  }
}

export interface ToolLister {
  listTools(params?: { cursor?: string }): Promise<{
    tools: { name: string; annotations?: { readOnlyHint?: boolean } }[]
    nextCursor?: string
  }>
}

export async function assertReadOnlyTool(
  client: ToolLister,
  name: string
): Promise<void> {
  let cursor: string | undefined
  let total = 0
  for (let page = 0; ; page++) {
    if (page >= MAX_TOOL_PAGES)
      throw new McpRunError('Server lists too many tools')
    const res = await client.listTools(cursor ? { cursor } : undefined)
    const tools = Array.isArray(res?.tools) ? res.tools : []
    total += tools.length
    if (total > MAX_TOOLS)
      throw new McpRunError('Server lists too many tools')
    const tool = tools.find(t => t?.name === name)
    if (tool) {
      if (tool.annotations?.readOnlyHint !== true)
        throw new McpRunError(
          `Tool "${name}" is not marked read-only; refusing to call it`
        )
      return
    }
    cursor =
      typeof res?.nextCursor === 'string' && res.nextCursor
        ? res.nextCursor
        : undefined
    if (!cursor) break
  }
  throw new McpRunError(`Tool "${name}" not found on the server`)
}
