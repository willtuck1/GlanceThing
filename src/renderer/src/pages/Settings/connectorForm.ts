// Pure helpers for the Connectors settings form. No DOM, no window.api.

type Api = Window['api']
// JSON connectors only; the MCP rows get their own UI.
export type ConnectorForSettings = Extract<
  Awaited<ReturnType<Api['listConnectors']>>[number],
  { source: { kind: 'json' } }
>
export type ConnectorMapping = ConnectorForSettings['mapping']
type NumberMapping = {
  value: string
  caption?: string
  unit?: string
  decimals?: number
}
export type ConnectorDraft = Exclude<
  Parameters<Api['saveConnector']>[0],
  { kind: 'mcp' }
>
export type ConnectorView = NonNullable<
  Awaited<ReturnType<Api['testConnector']>>['view']
>

export type FormLayout = 'list' | 'number' | 'keyvalue' | 'grid'

export const LAYOUT_LABELS: { id: FormLayout; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'number', label: 'Big number' },
  { id: 'keyvalue', label: 'Key-value' },
  { id: 'grid', label: 'Grid' }
]

export const MAX_PAIRS = 8
export const MIN_INTERVAL = 1
export const MAX_INTERVAL = 1440

export interface ConnectorForm {
  id?: string
  label: string
  url: string
  intervalMin: string
  layout: FormLayout
  itemsPath: string
  primary: string
  secondary: string
  listValue: string
  gridLabel: string
  gridValue: string
  numValue: string
  caption: string
  unit: string
  decimals: string
  pairs: { label: string; path: string }[]
  headerName: string
  // A newly typed secret value; never prefilled.
  headerValue: string
  // What is stored on the host.
  headerSet: boolean
  originalHeaderName: string
  headerCleared: boolean
  headerReplacing: boolean
}

export function emptyForm(): ConnectorForm {
  return {
    label: '',
    url: '',
    intervalMin: '15',
    layout: 'list',
    itemsPath: '',
    primary: '',
    secondary: '',
    listValue: '',
    gridLabel: '',
    gridValue: '',
    numValue: '',
    caption: '',
    unit: '',
    decimals: '',
    pairs: [{ label: '', path: '' }],
    headerName: '',
    headerValue: '',
    headerSet: false,
    originalHeaderName: '',
    headerCleared: false,
    headerReplacing: false
  }
}

export function formFromConnector(c: ConnectorForSettings): ConnectorForm {
  const f: ConnectorForm = {
    ...emptyForm(),
    id: c.id,
    label: c.label,
    url: c.source.url,
    intervalMin: String(c.intervalMin),
    layout: c.layout,
    headerName: c.source.header?.name ?? '',
    headerSet: c.headerSet && !!c.source.header,
    originalHeaderName: c.source.header?.name ?? ''
  }
  const m = c.mapping
  if (c.layout === 'list') {
    const l = m as Extract<ConnectorMapping, { primary: string }>
    f.itemsPath = l.itemsPath
    f.primary = l.primary
    f.secondary = l.secondary ?? ''
    f.listValue = l.value ?? ''
  } else if (c.layout === 'grid') {
    const g = m as Extract<ConnectorMapping, { label: string }>
    f.itemsPath = g.itemsPath
    f.gridLabel = g.label
    f.gridValue = g.value
  } else if (c.layout === 'number') {
    const n = m as NumberMapping
    f.numValue = n.value
    f.caption = n.caption ?? ''
    f.unit = n.unit ?? ''
    f.decimals = n.decimals === undefined ? '' : String(n.decimals)
  } else {
    const k = m as Extract<ConnectorMapping, { pairs: unknown }>
    f.pairs = k.pairs.map(p => ({ ...p }))
  }
  return f
}

// True when a header is (or will be) configured.
export function hasHeader(f: ConnectorForm): boolean {
  if (f.headerCleared || !f.headerSet) return !!f.headerValue.trim()
  return true
}

export function shouldWarnHttpSecret(f: ConnectorForm): boolean {
  return /^http:\/\//i.test(f.url.trim()) && hasHeader(f)
}

const INTERVAL_RE = /^\d+$/

export function validateForm(f: ConnectorForm): string[] {
  const errors: string[] = []
  if (!f.label.trim()) errors.push('Name is required')

  const url = f.url.trim()
  if (!/^https?:\/\//i.test(url)) {
    errors.push('URL must start with http:// or https://')
  } else {
    try {
      new URL(url)
    } catch {
      errors.push('URL is not valid')
    }
  }

  const iv = f.intervalMin.trim()
  const n = Number(iv)
  if (!INTERVAL_RE.test(iv) || n < MIN_INTERVAL || n > MAX_INTERVAL)
    errors.push(
      `Refresh interval must be a whole number from ${MIN_INTERVAL} to ${MAX_INTERVAL} minutes`
    )

  if (f.layout === 'list') {
    if (!f.primary.trim()) errors.push('Primary path is required')
  } else if (f.layout === 'grid') {
    if (!f.gridLabel.trim()) errors.push('Label path is required')
    if (!f.gridValue.trim()) errors.push('Value path is required')
  } else if (f.layout === 'number') {
    if (!f.numValue.trim()) errors.push('Value path is required')
    const d = f.decimals.trim()
    if (d && !/^[0-3]$/.test(d)) errors.push('Decimals must be 0 to 3')
  } else {
    if (f.pairs.length === 0) errors.push('Add at least one row')
    if (f.pairs.length > MAX_PAIRS)
      errors.push(`At most ${MAX_PAIRS} rows`)
    f.pairs.forEach((p, i) => {
      if (!p.label.trim()) errors.push(`Row ${i + 1} needs a label`)
      if (!p.path.trim()) errors.push(`Row ${i + 1} needs a path`)
    })
  }

  const name = f.headerName.trim()
  const value = f.headerValue.trim()
  const fresh = !f.headerSet || f.headerCleared
  if (fresh) {
    if (name && !value) errors.push('Secret header needs a value')
    if (value && !name) errors.push('Secret header needs a name')
  } else {
    if (!name) errors.push('Secret header needs a name (or clear it)')
  }
  return errors
}

function opt(s: string): string | undefined {
  const t = s.trim()
  return t ? t : undefined
}

function mappingFromForm(f: ConnectorForm): ConnectorMapping {
  switch (f.layout) {
    case 'list': {
      const m: ConnectorMapping = {
        itemsPath: f.itemsPath.trim(),
        primary: f.primary.trim()
      }
      const secondary = opt(f.secondary)
      const value = opt(f.listValue)
      if (secondary) (m as { secondary?: string }).secondary = secondary
      if (value) (m as { value?: string }).value = value
      return m
    }
    case 'grid':
      return {
        itemsPath: f.itemsPath.trim(),
        label: f.gridLabel.trim(),
        value: f.gridValue.trim()
      }
    case 'number': {
      const m: {
        value: string
        caption?: string
        unit?: string
        decimals?: number
      } = { value: f.numValue.trim() }
      const caption = opt(f.caption)
      const unit = opt(f.unit)
      const decimals = opt(f.decimals)
      if (caption) m.caption = caption
      if (unit) m.unit = unit
      if (decimals !== undefined) m.decimals = Number(decimals)
      return m
    }
    case 'keyvalue':
      return {
        pairs: f.pairs.map(p => ({
          label: p.label.trim(),
          path: p.path.trim()
        }))
      }
  }
}

// header: undefined = keep, null = clear, {name, value} = set/replace,
// {name} = rename and keep the stored value.
export function headerFromForm(
  f: ConnectorForm
): ConnectorDraft['header'] {
  const name = f.headerName.trim()
  const value = f.headerValue.trim()
  if (f.id && !name && f.originalHeaderName) return null
  if (!f.headerSet) return name && value ? { name, value } : undefined
  if (f.headerCleared) return name && value ? { name, value } : null
  if (value) return { name, value }
  if (name !== f.originalHeaderName) return { name }
  return undefined
}

export function draftFromForm(f: ConnectorForm): ConnectorDraft {
  const draft: ConnectorDraft = {
    label: f.label.trim(),
    layout: f.layout,
    mapping: mappingFromForm(f),
    intervalMin: Number(f.intervalMin.trim()),
    url: f.url.trim()
  }
  if (f.id) draft.id = f.id
  const header = headerFromForm(f)
  if (header !== undefined) draft.header = header
  return draft
}
