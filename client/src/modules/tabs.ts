import { isConnectorId, LAYOUTS } from './connector/types.ts'

import type { ConnectorDescriptor } from './connector/types.ts'

const MAX_LABEL = 24

export interface TabsSettings {
  order: string[]
  hidden: string[]
  connectors: ConnectorDescriptor[]
}

function descriptors(value: unknown): ConnectorDescriptor[] {
  if (!Array.isArray(value)) return []
  const result: ConnectorDescriptor[] = []
  for (const d of value) {
    if (typeof d !== 'object' || d === null) continue
    const { id, label, layout } = d as Record<string, unknown>
    if (typeof id !== 'string' || !isConnectorId(id))
      continue
    if (typeof label !== 'string') continue
    if (!LAYOUTS.some(l => l === layout)) continue
    if (result.some(r => r.id === id)) continue
    result.push({
      id,
      label: label.slice(0, MAX_LABEL),
      layout: layout as ConnectorDescriptor['layout']
    })
  }
  return result
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((v): v is string => typeof v === 'string')
}

export function parseTabs(data: unknown): TabsSettings | null {
  if (typeof data !== 'object' || data === null) return null
  const { order, hidden, connectors } = data as Record<string, unknown>
  const o = strings(order)
  const h = strings(hidden)
  if (!o || !h) return null
  return { order: o, hidden: h, connectors: descriptors(connectors) }
}

// Ids to show, in display order. Never empty.
export function visibleIds(
  settings: TabsSettings | null,
  ids: string[]
): string[] {
  if (!settings) return ids

  const result: string[] = []
  for (const id of settings.order) {
    if (ids.includes(id) && !result.includes(id)) result.push(id)
  }
  for (const id of ids) {
    if (!result.includes(id)) result.push(id)
  }

  const shown = result.filter(id => !settings.hidden.includes(id))
  return shown.length > 0 ? shown : ids
}
