// Connector model shared by JSON connectors (M9B) and MCP connectors (M9C).
// A connector is a runtime module with id `json:<id>` (or `mcp:<id>` later).

export type Layout = 'list' | 'number' | 'keyvalue' | 'grid'

export const LAYOUTS: Layout[] = ['list', 'number', 'keyvalue', 'grid']

// Paths use dots and array indexes, e.g. `data.items[0].price`. '' is the root.
// For list and grid, `itemsPath` picks an array and the other paths are
// relative to each item.
export interface ListMapping {
  itemsPath: string
  primary: string
  secondary?: string
  value?: string
}

export interface GridMapping {
  itemsPath: string
  label: string
  value: string
}

export interface NumberMapping {
  value: string
  caption?: string
  // Literal text shown after the number, not a path.
  unit?: string
  // 0-3; omitted means up to 2 decimals.
  decimals?: number
}

export interface KeyValueMapping {
  // Labels are literal text; at most 8 pairs.
  pairs: { label: string; path: string }[]
}

export type Mapping =
  | ListMapping
  | GridMapping
  | NumberMapping
  | KeyValueMapping

// Only the header name is stored in the connector list. The value lives in
// secure storage under `connectorSecret.<id>` and never leaves the host.
export interface JsonSource {
  kind: 'json'
  url: string
  header?: { name: string }
}

// MCP connector: a committed recipe run against an MCP server. Layout and
// mapping are copied from the recipe. `settings` are recipe parameters.
export interface McpSource {
  kind: 'mcp'
  // ^[a-z0-9-]{1,32}$
  recipeId: string
  serverUrl: string
  settings?: Record<string, string>
}

export type ConnectorSource = JsonSource | McpSource
export type ConnectorKind = ConnectorSource['kind']

export interface Connector {
  // ^[a-z0-9]{8}$, assigned once; stable across edits and renames.
  id: string
  label: string
  layout: Layout
  mapping: Mapping
  // 1-1440
  intervalMin: number
  source: ConnectorSource
}

// What the device receives: display-ready strings only, never the raw response.
export interface ListRow {
  primary: string
  secondary?: string
  value?: string
}

export type ConnectorView =
  | { layout: 'list'; rows: ListRow[]; more: number }
  | {
      layout: 'grid'
      cells: { label: string; value: string }[]
      more: number
    }
  | { layout: 'number'; value: string; unit?: string; caption?: string }
  | { layout: 'keyvalue'; pairs: { label: string; value: string }[] }

// Sent to the device in the `tabs` message so it can render tabs it has never
// seen. `id` is the module id (`json:<id>`).
export interface ConnectorDescriptor {
  id: string
  label: string
  layout: Layout
}

export const CONNECTOR_PREFIX = 'json:'
export const CONNECTOR_PREFIXES = ['json:', 'mcp:'] as const

export function isConnectorModuleId(s: string): boolean {
  return (
    typeof s === 'string' && CONNECTOR_PREFIXES.some(p => s.startsWith(p))
  )
}

export function connectorModuleId(c: Connector): string {
  return `${c.source.kind}:${c.id}`
}

export const LIMITS = {
  listRows: 20,
  gridCells: 12,
  keyValuePairs: 8,
  primaryChars: 80,
  secondaryChars: 40,
  valueChars: 16,
  labelChars: 40,
  minIntervalMin: 1,
  maxIntervalMin: 1440
} as const
