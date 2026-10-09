// Copied from src/main/lib/connectors/types.ts (the client can't import host
// code). Keep in sync.
export type Layout = 'list' | 'number' | 'keyvalue' | 'grid'

export const LAYOUTS: Layout[] = ['list', 'number', 'keyvalue', 'grid']

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

export interface ConnectorDescriptor {
  id: string
  label: string
  layout: Layout
}

export const CONNECTOR_PREFIX = 'json:'
