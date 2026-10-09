// Persistent store for user-defined JSON connectors.
// `connectors` (plain storage) holds Connector[] and never a secret value.
// A connector's secret header value lives in secure storage under
// `connectorSecret.<id>` and never leaves the host. This module logs nothing.

import { randomBytes } from 'node:crypto'

import {
  deleteStorageValue,
  getStorageValue,
  setStorageValue
} from '../storage.js'

import { fetchConnectorJson } from './fetch.js'
import { applyMapping } from './mapping.js'
import { Connector, ConnectorView } from './types.js'
import {
  validateHeaderName,
  validateHeaderValue,
  validateInterval,
  validateLabel,
  validateMapping,
  validateUrl
} from './validate.js'

export const CONNECTORS_KEY = 'connectors'
export const SECRET_PREFIX = 'connectorSecret.'
export const MAX_CONNECTORS = 20

const ID_RE = /^[a-z0-9]{8}$/
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

// The generic storage IPC must never read or write these keys.
export function isProtectedStorageKey(key: unknown): boolean {
  const k = String(key)
  return k === CONNECTORS_KEY || k.startsWith(SECRET_PREFIX)
}

function secretKey(id: string): string {
  return `${SECRET_PREFIX}${id}`
}

export interface ConnectorDraft {
  id?: string
  label: unknown
  layout: unknown
  mapping: unknown
  intervalMin: unknown
  url: unknown
  // undefined = keep, null = clear, {name, value} = set both,
  // {name} = rename and keep the stored value.
  header?: { name: string; value?: string } | null
}

export type ConnectorForSettings = Connector & { headerSet: boolean }

// Re-validates one stored entry; null when it is malformed.
function parseStored(raw: unknown): Connector | null {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null
    const source = r.source as Record<string, unknown> | undefined
    if (!source || typeof source !== 'object' || source.kind !== 'json')
      return null
    const { layout, mapping } = validateMapping(r.layout, r.mapping)
    const connector: Connector = {
      id: r.id,
      label: validateLabel(r.label),
      layout,
      mapping,
      intervalMin: validateInterval(r.intervalMin),
      source: { kind: 'json', url: validateUrl(source.url).href }
    }
    if (source.header !== undefined && source.header !== null) {
      const h = source.header as Record<string, unknown>
      connector.source.header = { name: validateHeaderName(h?.name) }
    }
    return connector
  } catch {
    return null
  }
}

export function listConnectors(): Connector[] {
  let raw: unknown
  try {
    raw = getStorageValue(CONNECTORS_KEY)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const out: Connector[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const c = parseStored(entry)
    if (!c || seen.has(c.id)) continue
    seen.add(c.id)
    out.push(c)
  }
  return out
}

export function getConnector(id: string): Connector | null {
  return listConnectors().find(c => c.id === id) ?? null
}

// Host-internal only (the fetcher). Never send this to a renderer or device.
export function getConnectorSecret(id: string): string | null {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null
  try {
    const v = getStorageValue(secretKey(id), true)
    return typeof v === 'string' && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export function listConnectorsForSettings(): ConnectorForSettings[] {
  return listConnectors().map(c => ({
    ...c,
    headerSet: !!c.source.header && getConnectorSecret(c.id) !== null
  }))
}

// `id` of the result is the existing id, or '' for a new connector (assigned
// by saveConnector). `secret`: undefined = unchanged, null = delete,
// string = set.
export function validateDraft(
  draft: unknown,
  existing?: Connector
): { connector: Connector; secret: string | null | undefined } {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft))
    throw new Error('Invalid connector')
  const d = draft as Record<string, unknown>

  const label = validateLabel(d.label)
  const url = validateUrl(d.url).href
  const intervalMin = validateInterval(d.intervalMin)
  const { layout, mapping } = validateMapping(d.layout, d.mapping)

  const connector: Connector = {
    id: existing?.id ?? '',
    label,
    layout,
    mapping,
    intervalMin,
    source: { kind: 'json', url }
  }

  let secret: string | null | undefined
  const header = d.header
  if (header === undefined) {
    if (existing?.source.header)
      connector.source.header = { name: existing.source.header.name }
    secret = undefined
  } else if (header === null) {
    secret = null
  } else {
    if (typeof header !== 'object' || Array.isArray(header))
      throw new Error('Invalid header')
    const h = header as Record<string, unknown>
    const name = validateHeaderName(
      typeof h.name === 'string' ? h.name.trim() : h.name
    )
    connector.source.header = { name }
    if (h.value === undefined || h.value === null || h.value === '') {
      if (!existing || getConnectorSecret(existing.id) === null)
        throw new Error('Enter a header value')
      secret = undefined
    } else {
      secret = validateHeaderValue(h.value)
    }
  }
  return { connector, secret }
}

// The header to send for a validated draft: the draft's new value, else the
// stored one for that id. Never logged or returned to callers outside the host.
export function resolveDraftSecret(
  connector: Connector,
  secret: string | null | undefined
): { name: string; value: string } | undefined {
  const name = connector.source.header?.name
  if (!name || secret === null) return undefined
  const value =
    typeof secret === 'string'
      ? secret
      : connector.id
        ? getConnectorSecret(connector.id)
        : null
  return value ? { name, value } : undefined
}

type Listener = (connectors: Connector[]) => void
const listeners: Listener[] = []

export function onConnectorsChanged(fn: Listener): () => void {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i !== -1) listeners.splice(i, 1)
  }
}

function emitChanged() {
  const list = listConnectors()
  for (const fn of listeners.slice()) {
    try {
      fn(list)
    } catch {
      // A failing listener must not break saving.
    }
  }
}

function newId(taken: Set<string>): string {
  for (;;) {
    const bytes = randomBytes(8)
    let id = ''
    for (const b of bytes) id += ID_CHARS[b % ID_CHARS.length]
    if (!taken.has(id)) return id
  }
}

function findExisting(list: Connector[], id: unknown): Connector {
  const found =
    typeof id === 'string' ? list.find(c => c.id === id) : undefined
  if (!found) throw new Error('Connector not found')
  return found
}

export function saveConnector(draft: ConnectorDraft): Connector {
  const list = listConnectors()
  const rawId = (draft as { id?: unknown } | null)?.id
  const existing =
    rawId !== undefined && rawId !== null
      ? findExisting(list, rawId)
      : undefined
  if (!existing && list.length >= MAX_CONNECTORS)
    throw new Error(`At most ${MAX_CONNECTORS} connectors`)

  const { connector, secret } = validateDraft(draft, existing)
  if (!existing)
    connector.id = newId(new Set(list.map(c => c.id)))

  if (typeof secret === 'string')
    setStorageValue(secretKey(connector.id), secret, true)
  else if (secret === null) deleteStorageValue(secretKey(connector.id))

  const next = existing
    ? list.map(c => (c.id === connector.id ? connector : c))
    : [...list, connector]
  setStorageValue(CONNECTORS_KEY, next)
  emitChanged()
  return connector
}

export function deleteConnector(id: string): boolean {
  const list = listConnectors()
  const next = list.filter(c => c.id !== id)
  if (next.length === list.length) return false
  setStorageValue(CONNECTORS_KEY, next)
  deleteStorageValue(secretKey(id))
  emitChanged()
  return true
}

// Validates and fetches a draft without saving it (Settings "Test").
// Never throws, never logs, and never returns the secret.
export async function testDraft(
  draft: unknown
): Promise<{ view?: ConnectorView; error?: string }> {
  let header: { name: string; value: string } | undefined
  try {
    const rawId = (draft as { id?: unknown } | null)?.id
    const existing =
      rawId !== undefined && rawId !== null
        ? findExisting(listConnectors(), rawId)
        : undefined
    const { connector, secret } = validateDraft(draft, existing)
    header = resolveDraftSecret(connector, secret)
    const data = await fetchConnectorJson(connector.source.url, { header })
    const view = applyMapping(connector.layout, connector.mapping, data)
    // A server that echoes the header back must not leak it to Settings.
    if (header && JSON.stringify(view).includes(header.value))
      return { error: 'Response contains the header value' }
    return { view }
  } catch (e) {
    const raw = e instanceof Error && e.message ? e.message : 'Test failed'
    const leaked = !!header && raw.includes(header.value)
    return { error: leaked ? 'Test failed' : raw }
  }
}
