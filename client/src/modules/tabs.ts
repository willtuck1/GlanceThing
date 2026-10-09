export interface TabsSettings {
  order: string[]
  hidden: string[]
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((v): v is string => typeof v === 'string')
}

export function parseTabs(data: unknown): TabsSettings | null {
  if (typeof data !== 'object' || data === null) return null
  const { order, hidden } = data as Record<string, unknown>
  const o = strings(order)
  const h = strings(hidden)
  if (!o || !h) return null
  return { order: o, hidden: h }
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
