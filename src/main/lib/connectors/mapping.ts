import { getPath, parsePath } from './path.js'
import {
  ConnectorView,
  GridMapping,
  KeyValueMapping,
  Layout,
  LIMITS,
  ListMapping,
  ListRow,
  Mapping,
  NumberMapping
} from './types.js'

const NUMERIC = /^-?\d+(\.\d+)?$/

export function formatValue(
  v: unknown,
  opts: { decimals?: number; numeric?: boolean } = {}
): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      maximumFractionDigits: opts.decimals ?? 2,
      minimumFractionDigits: opts.decimals ?? 0
    }).format(n)
  if (typeof v === 'string') {
    const t = v.trim()
    if (opts.numeric && NUMERIC.test(t)) return fmt(Number(t))
    return v
  }
  if (typeof v === 'number') return Number.isFinite(v) ? fmt(v) : ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return ''
}

// Control, zero-width, line/paragraph separator and bidi override characters.
export function isInvisibleChar(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  )
}

function stripInvisible(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (!isInvisibleChar(s.charCodeAt(i))) out += s[i]
  }
  return out
}

export function clean(s: string, max: number): string {
  const t = stripInvisible(s.replace(/[\t\n\r]/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).trimEnd() + '…'
}

function read(data: unknown, path: string | undefined): unknown {
  return getPath(data, parsePath(path ?? ''))
}

function text(
  data: unknown,
  path: string,
  max: number,
  numeric = false,
  decimals?: number
): string {
  return clean(formatValue(read(data, path), { numeric, decimals }), max)
}

function items(data: unknown, itemsPath: string): unknown[] {
  const list = read(data, itemsPath)
  if (!Array.isArray(list)) throw new Error('Items path is not a list')
  return list
}

export function applyMapping(
  layout: Layout,
  mapping: Mapping,
  data: unknown
): ConnectorView {
  switch (layout) {
    case 'list': {
      const m = mapping as ListMapping
      const all = items(data, m.itemsPath)
      const rows = all.slice(0, LIMITS.listRows).map(item => {
        const row: ListRow = {
          primary: text(item, m.primary, LIMITS.primaryChars)
        }
        if (m.secondary)
          row.secondary = text(item, m.secondary, LIMITS.secondaryChars)
        if (m.value) row.value = text(item, m.value, LIMITS.valueChars)
        return row
      })
      return {
        layout,
        rows,
        more: Math.max(0, all.length - LIMITS.listRows)
      }
    }
    case 'grid': {
      const m = mapping as GridMapping
      const all = items(data, m.itemsPath)
      const cells = all.slice(0, LIMITS.gridCells).map(item => ({
        label: text(item, m.label, LIMITS.labelChars),
        value: text(item, m.value, LIMITS.valueChars)
      }))
      return {
        layout,
        cells,
        more: Math.max(0, all.length - LIMITS.gridCells)
      }
    }
    case 'number': {
      const m = mapping as NumberMapping
      const view: ConnectorView = {
        layout,
        value: text(data, m.value, LIMITS.valueChars, true, m.decimals)
      }
      if (m.unit) view.unit = clean(m.unit, 8)
      if (m.caption)
        view.caption = text(data, m.caption, LIMITS.labelChars)
      return view
    }
    case 'keyvalue': {
      const m = mapping as KeyValueMapping
      return {
        layout,
        pairs: m.pairs.slice(0, LIMITS.keyValuePairs).map(p => ({
          label: clean(p.label, LIMITS.labelChars),
          value: text(data, p.path, LIMITS.primaryChars)
        }))
      }
    }
  }
}
