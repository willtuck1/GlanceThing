// Fetches a JSON connector URL once and returns a trimmed, secret-free copy
// of the response for the Settings builder. The sample is bounded (depth,
// array items, string and key length, keys per object, total size), drops
// prototype-polluting keys, and redacts the secret header value (raw,
// URL-encoded and base64). Errors never contain the URL or the secret, and
// this module logs nothing.

import { plainError } from './errors.js'
import { fetchConnectorJson, type FetchDeps } from './fetch.js'
import { getConnector, getConnectorSecret } from './store.js'
import {
  validateHeaderName,
  validateHeaderValue,
  validateUrl
} from './validate.js'

export interface SampleResult {
  sample: unknown
  truncated: boolean
}

export const SAMPLE_LIMITS = {
  depth: 8,
  arrayItems: 5,
  stringChars: 80,
  keyChars: 80,
  keysPerObject: 50,
  bytes: 65536
} as const

const ELLIPSIS = '…'
const REDACTED = '[redacted]'
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const SECRET_IN_RESPONSE = 'Response contains the secret header value'

type Leaf = string | number | boolean | null
type Node =
  | { kind: 'leaf'; value: Leaf }
  | { kind: 'arr'; items: Node[] }
  | { kind: 'obj'; entries: [string, Node][] }

function secretForms(secret: string | null | undefined): string[] {
  if (!secret) return []
  const forms = new Set([secret])
  if (secret.length >= 4) {
    forms.add(encodeURIComponent(secret))
    const b64 = Buffer.from(secret, 'utf8').toString('base64')
    forms.add(b64)
    forms.add(b64.replace(/=+$/, ''))
    forms.add(
      b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    )
  }
  // Longest first so a longer form isn't half-replaced by a shorter one.
  return [...forms].filter(f => f).sort((a, b) => b.length - a.length)
}

class Builder {
  truncated = false
  constructor(private forms: string[]) {}

  // Redacts before cutting, so a cut can never leave part of a secret.
  text(s: string, max: number): string {
    let out = s
    for (const f of this.forms)
      if (out.includes(f)) out = out.split(f).join(REDACTED)
    if (out.length > max) {
      this.truncated = true
      out = out.slice(0, max - 1) + ELLIPSIS
    }
    return out
  }

  build(value: unknown, depth: number): Node {
    if (value === null) return { kind: 'leaf', value: null }
    switch (typeof value) {
      case 'string':
        return {
          kind: 'leaf',
          value: this.text(value, SAMPLE_LIMITS.stringChars)
        }
      case 'number':
        return {
          kind: 'leaf',
          value: Number.isFinite(value) ? value : null
        }
      case 'boolean':
        return { kind: 'leaf', value }
      case 'object':
        break
      default:
        return { kind: 'leaf', value: null }
    }
    if (depth > SAMPLE_LIMITS.depth) {
      this.truncated = true
      return { kind: 'leaf', value: ELLIPSIS }
    }
    if (Array.isArray(value)) {
      if (value.length > SAMPLE_LIMITS.arrayItems) this.truncated = true
      return {
        kind: 'arr',
        items: value
          .slice(0, SAMPLE_LIMITS.arrayItems)
          .map(v => this.build(v, depth + 1))
      }
    }
    const entries: [string, Node][] = []
    const seen = new Set<string>()
    for (const rawKey of Object.keys(value as object)) {
      if (FORBIDDEN_KEYS.has(rawKey)) continue
      const key = this.text(rawKey, SAMPLE_LIMITS.keyChars)
      if (FORBIDDEN_KEYS.has(key) || seen.has(key)) {
        this.truncated = true
        continue
      }
      if (entries.length >= SAMPLE_LIMITS.keysPerObject) {
        this.truncated = true
        break
      }
      seen.add(key)
      entries.push([
        key,
        this.build((value as Record<string, unknown>)[rawKey], depth + 1)
      ])
    }
    return { kind: 'obj', entries }
  }
}

function toPlain(node: Node): unknown {
  if (node.kind === 'leaf') return node.value
  if (node.kind === 'arr') return node.items.map(toPlain)
  const out: Record<string, unknown> = {}
  for (const [k, v] of node.entries)
    if (!FORBIDDEN_KEYS.has(k)) out[k] = toPlain(v)
  return out
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

type Container = Extract<Node, { kind: 'arr' | 'obj' }>

function childCount(c: Container): number {
  return c.kind === 'arr' ? c.items.length : c.entries.length
}

// Bytes saved by removing the last child of `c` (value, key, comma).
function popLast(c: Container): number {
  const comma = childCount(c) > 1 ? 1 : 0
  if (c.kind === 'arr') return bytes(toPlain(c.items.pop()!)) + comma
  const [k, v] = c.entries.pop()!
  return bytes(k) + 1 + bytes(toPlain(v)) + comma
}

// Drops trailing children, deepest level first and round-robin across the
// containers on that level, until the serialized size fits.
function shrink(root: Node, size: number, max: number): number {
  const levels: Container[][] = []
  const walk = (n: Node, d: number) => {
    if (n.kind === 'leaf') return
    if (!levels[d]) levels[d] = []
    levels[d].push(n)
    const kids = n.kind === 'arr' ? n.items : n.entries.map(e => e[1])
    for (const k of kids) walk(k, d + 1)
  }
  walk(root, 0)
  for (let d = levels.length - 1; d >= 0 && size > max; d--) {
    let pending = (levels[d] ?? []).filter(c => childCount(c) > 0)
    while (pending.length && size > max) {
      for (let i = pending.length - 1; i >= 0 && size > max; i--)
        size -= popLast(pending[i])
      pending = pending.filter(c => childCount(c) > 0)
    }
  }
  return size
}

export function sanitizeSampleResult(
  json: unknown,
  secret?: string | null
): SampleResult {
  try {
    const builder = new Builder(secretForms(secret))
    const root = builder.build(json, 1)
    let truncated = builder.truncated
    let sample = toPlain(root)
    let size = bytes(sample)
    if (size > SAMPLE_LIMITS.bytes) {
      truncated = true
      size = shrink(root, size, SAMPLE_LIMITS.bytes)
      sample = toPlain(root)
      if (bytes(sample) > SAMPLE_LIMITS.bytes) sample = ELLIPSIS
    }
    return { sample, truncated }
  } catch {
    return { sample: null, truncated: true }
  }
}

export function sanitizeSample(
  json: unknown,
  secret?: string | null
): unknown {
  return sanitizeSampleResult(json, secret).sample
}

export interface SampleDraft {
  url: unknown
  header?: { name: string; value?: string } | null
  id?: string
}

// The stored secret for `id`, only while the URL keeps the stored origin
// (same rule as store.ts validateDraft).
function storedSecret(id: unknown, url: URL): string {
  const existing = typeof id === 'string' ? getConnector(id) : null
  const value = existing ? getConnectorSecret(existing.id) : null
  if (!existing || existing.source.kind !== 'json' || !value)
    throw new Error('Enter a header value')
  if (new URL(existing.source.url).origin !== url.origin)
    throw new Error(
      "Enter the header value again when changing the URL's host"
    )
  return value
}

// Fetches a draft's URL once for the builder. Never rejects, never logs,
// never returns the URL or the secret.
export async function fetchSample(
  draft: SampleDraft,
  deps?: FetchDeps
): Promise<SampleResult | { error: string }> {
  let secret: string | null = null
  const urls: string[] = []
  try {
    if (!draft || typeof draft !== 'object') throw new Error('Invalid URL')
    if (typeof draft.url === 'string' && draft.url.trim())
      urls.push(draft.url.trim())
    const url = validateUrl(draft.url)
    urls.push(url.href, url.host)
    let header: { name: string; value: string } | undefined
    const h = draft.header as unknown
    if (h !== undefined && h !== null) {
      if (typeof h !== 'object' || Array.isArray(h))
        throw new Error('Invalid header')
      const { name: rawName, value } = h as Record<string, unknown>
      const name = validateHeaderName(
        typeof rawName === 'string' ? rawName.trim() : rawName
      )
      secret =
        value === undefined || value === null || value === ''
          ? storedSecret(draft.id, url)
          : validateHeaderValue(value)
      header = { name, value: secret }
    }
    const data = await fetchConnectorJson(url.href, { header, deps })
    const result = sanitizeSampleResult(data, secret)
    if (secret && JSON.stringify(result.sample).includes(secret))
      return { error: SECRET_IN_RESPONSE }
    return result
  } catch (e) {
    let message: string
    try {
      message = plainError(e, { secretSet: !!secret })
    } catch {
      message = 'Fetch failed'
    }
    const leaks =
      typeof message !== 'string' ||
      !message ||
      (!!secret && message.includes(secret)) ||
      urls.some(u => message.includes(u))
    return { error: leaks ? 'Fetch failed' : message }
  }
}
