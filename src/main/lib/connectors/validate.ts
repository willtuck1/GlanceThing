import { parsePath } from './path.js'
import { Layout, LAYOUTS, LIMITS, Mapping } from './types.js'

function obj(raw: unknown, what: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error(`${what} must be an object`)
  return raw as Record<string, unknown>
}

// Reads a path field. `required` fields must be non-empty; others may be ''
// (root) when `allowRoot` or are dropped (undefined) when empty.
function pathField(
  prefix: string,
  m: Record<string, unknown>,
  key: string,
  name: string,
  mode: 'required' | 'optional' | 'root'
): string | undefined {
  const raw = m[key]
  if (raw !== undefined && raw !== null && typeof raw !== 'string')
    throw new Error(`${prefix}: "${name}" must be text`)
  const p = (raw ?? '').toString().trim()
  if (!p) {
    if (mode === 'required')
      throw new Error(`${prefix}: "${name}" path is required`)
    return mode === 'root' ? '' : undefined
  }
  try {
    parsePath(p)
  } catch {
    throw new Error(`Invalid path "${p}" in ${name}`)
  }
  return p
}

function drop<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[])
    if (o[k] === undefined) delete o[k]
  return o
}

export function validateMapping(
  layout: unknown,
  mapping: unknown
): { layout: Layout; mapping: Mapping } {
  if (!LAYOUTS.includes(layout as Layout))
    throw new Error('Unknown layout')
  const m = obj(mapping, 'Mapping')
  switch (layout as Layout) {
    case 'list':
      return {
        layout: 'list',
        mapping: drop({
          itemsPath: pathField('List', m, 'itemsPath', 'Items', 'root')!,
          primary: pathField('List', m, 'primary', 'Primary', 'required')!,
          secondary: pathField(
            'List',
            m,
            'secondary',
            'Secondary',
            'optional'
          ),
          value: pathField('List', m, 'value', 'Value', 'optional')
        })
      }
    case 'grid':
      return {
        layout: 'grid',
        mapping: {
          itemsPath: pathField('Grid', m, 'itemsPath', 'Items', 'root')!,
          label: pathField('Grid', m, 'label', 'Label', 'required')!,
          value: pathField('Grid', m, 'value', 'Value', 'required')!
        }
      }
    case 'number': {
      const out = drop({
        value: pathField('Number', m, 'value', 'Value', 'required')!,
        caption: pathField('Number', m, 'caption', 'Caption', 'optional'),
        unit: undefined as string | undefined,
        decimals: undefined as number | undefined
      })
      if (m.unit !== undefined && m.unit !== null) {
        if (typeof m.unit !== 'string')
          throw new Error('Number: unit must be text')
        const unit = m.unit.trim()
        if (unit.length > 8)
          throw new Error('Number: unit is at most 8 characters')
        if (unit) out.unit = unit
      }
      if (m.decimals !== undefined && m.decimals !== null) {
        const d = m.decimals
        if (
          typeof d !== 'number' ||
          !Number.isInteger(d) ||
          d < 0 ||
          d > 3
        )
          throw new Error('Number: decimals must be 0-3')
        out.decimals = d
      }
      return { layout: 'number', mapping: drop(out) }
    }
    case 'keyvalue': {
      if (!Array.isArray(m.pairs) || m.pairs.length === 0)
        throw new Error('Key-value: add at least one pair')
      if (m.pairs.length > LIMITS.keyValuePairs)
        throw new Error(`Key-value: at most ${LIMITS.keyValuePairs} pairs`)
      const pairs = m.pairs.map((raw: unknown, i: number) => {
        const p = obj(raw, `Key-value: pair ${i + 1}`)
        const label = typeof p.label === 'string' ? p.label.trim() : ''
        if (!label)
          throw new Error(`Key-value: pair ${i + 1} needs a label`)
        if (label.length > LIMITS.labelChars)
          throw new Error(
            `Key-value: label must be at most ${LIMITS.labelChars} characters`
          )
        const path = pathField(
          'Key-value',
          p,
          'path',
          `Path of pair ${i + 1}`,
          'required'
        )!
        return { label, path }
      })
      return { layout: 'keyvalue', mapping: { pairs } }
    }
  }
}

export function validateUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim())
    throw new Error('URL is required')
  const s = raw.trim()
  if (s.length > 2000)
    throw new Error('URL is too long (max 2000 characters)')
  let url: URL
  try {
    url = new URL(s)
  } catch {
    throw new Error('URL is not valid')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('URL must start with http:// or https://')
  if (url.username || url.password)
    throw new Error('URL must not contain a username or password')
  if (!url.hostname) throw new Error('URL needs a host name')
  return url
}

export function validateLabel(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) throw new Error('Name is required')
  if (s.length > 24) throw new Error('Name must be at most 24 characters')
  return s
}

export function validateInterval(raw: unknown): number {
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < LIMITS.minIntervalMin ||
    raw > LIMITS.maxIntervalMin
  )
    throw new Error(
      `Interval must be a whole number of minutes, ${LIMITS.minIntervalMin}-${LIMITS.maxIntervalMin}`
    )
  return raw
}

const BLOCKED_HEADERS = [
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'cookie'
]

export function validateHeaderName(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/.test(raw)
  )
    throw new Error(
      'Header name must be 1-64 letters, digits or - _ . characters'
    )
  if (BLOCKED_HEADERS.includes(raw.toLowerCase()))
    throw new Error(`Header "${raw}" is not allowed`)
  return raw
}

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if ((c <= 0x1f && c !== 0x09) || c === 0x7f) return true
  }
  return false
}

export function validateHeaderValue(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 4096)
    throw new Error('Header value must be 1-4096 characters')
  if (hasControlChar(raw))
    throw new Error('Header value must not contain control characters')
  return raw
}
