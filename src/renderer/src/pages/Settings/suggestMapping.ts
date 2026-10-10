// Guesses a connector layout and mapping from a sanitized JSON sample.
// Pure; runs in the renderer on the sample the host returns.

// Copied from src/main/lib/connectors/types.ts; keep in sync.
export type Layout = 'list' | 'number' | 'keyvalue' | 'grid'

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
  unit?: string
  decimals?: number
}

export interface KeyValueMapping {
  pairs: { label: string; path: string }[]
}

export type Mapping =
  | ListMapping
  | GridMapping
  | NumberMapping
  | KeyValueMapping

type Obj = Record<string, unknown>

const MAX_DEPTH = 8
const MAX_NUMBER_DEPTH = 3
const MAX_PAIRS = 8
const MAX_LABEL = 40
const MAX_PATH = 200
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])
const IGNORED_NUMBER_KEYS =
  /^(id|timestamp|time|lat|lon|latitude|longitude)$/i
const PRIMARY_KEY =
  /^(title|name|label|headline|summary|display_?name|full_?name)$/i
const SECONDARY_KEY =
  /(subtitle|description|status|type|category|symbol|time|date)/i
const VALUE_KEY = /(price|value|score|count|total|amount|temp|state)/i
const ID_KEY = /^(id|uuid|.*_id|.*Id)$/
const CAPTION_KEY = /^(title|name|label|headline|symbol|display_?name)$/i

const isObj = (v: unknown): v is Obj =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)
const isScalar = (v: unknown): boolean =>
  typeof v === 'string' || isNum(v) || typeof v === 'boolean'

// Keys the path syntax can express.
function safeKey(k: string): boolean {
  return (
    k !== '' &&
    k === k.trim() &&
    !/[.[\]]/.test(k) &&
    !FORBIDDEN.has(k) &&
    k.length < 100
  )
}

export function joinPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`
  return parent ? `${parent}.${key}` : key
}

// `data.items[2].price` within `data.items` -> `price`. Null when the node is
// outside the array or is the item itself.
export function relativePath(
  itemsPath: string,
  absolute: string
): string | null {
  if (!absolute.startsWith(itemsPath)) return null
  const rest = absolute.slice(itemsPath.length)
  const m = /^\[\d+\](.*)$/.exec(rest)
  if (!m) return null
  const tail = m[1]
  if (tail === '') return null
  if (tail.startsWith('.')) return tail.length > 1 ? tail.slice(1) : null
  return tail.startsWith('[') ? tail : null
}

interface Found {
  path: string
  items: unknown[]
  depth: number
}

function findLargestArray(root: unknown): Found | null {
  let best: Found | null = null
  const visit = (v: unknown, path: string, depth: number): void => {
    if (depth > MAX_DEPTH) return
    if (Array.isArray(v)) {
      if (v.length > 0 && isObj(v[0])) {
        if (
          !best ||
          v.length > best.items.length ||
          (v.length === best.items.length && depth < best.depth)
        )
          best = { path, items: v, depth }
      }
      v.forEach((x, i) => visit(x, joinPath(path, i), depth + 1))
    } else if (isObj(v)) {
      for (const k of Object.keys(v))
        if (safeKey(k)) visit(v[k], joinPath(path, k), depth + 1)
    }
  }
  visit(root, '', 0)
  return best
}

interface Leaf {
  path: string
  value: string | number | boolean
}

// Scalar fields of an object, top level first, then one level into nested
// objects.
function scalarLeaves(o: Obj): Leaf[] {
  const top: Leaf[] = []
  const nested: Leaf[] = []
  for (const k of Object.keys(o)) {
    if (!safeKey(k)) continue
    const v = o[k]
    if (isScalar(v)) top.push({ path: k, value: v as Leaf['value'] })
    else if (isObj(v))
      for (const k2 of Object.keys(v))
        if (safeKey(k2) && isScalar(v[k2]))
          nested.push({
            path: `${k}.${k2}`,
            value: v[k2] as Leaf['value']
          })
  }
  return [...top, ...nested]
}

// Merge the leaves of the first few items; the first item that has a field
// decides its sample value.
function mergedLeaves(items: unknown[]): Leaf[] {
  const seen = new Map<string, Leaf>()
  for (const it of items.slice(0, 3))
    if (isObj(it))
      for (const l of scalarLeaves(it))
        if (!seen.has(l.path)) seen.set(l.path, l)
  const all = [...seen.values()]
  return [
    ...all.filter(l => !l.path.includes('.')),
    ...all.filter(l => l.path.includes('.'))
  ]
}

const leafName = (l: Leaf) => l.path.slice(l.path.lastIndexOf('.') + 1)

function listMapping(found: Found): Mapping | null {
  const leaves = mergedLeaves(found.items)
  const strings = leaves.filter(l => typeof l.value === 'string')
  const primary =
    strings.find(l => !l.path.includes('.') && PRIMARY_KEY.test(l.path)) ??
    strings[0] ??
    leaves[0]
  if (!primary) return null

  const numbers = leaves.filter(l => isNum(l.value))
  if (
    found.items.length >= 3 &&
    leaves.length === 2 &&
    strings.length === 1 &&
    numbers.length === 1
  )
    return {
      itemsPath: found.path,
      label: strings[0].path,
      value: numbers[0].path
    }

  const used = new Set([primary.path])
  const shortStrings = strings.filter(
    l => !used.has(l.path) && (l.value as string).length <= 40
  )
  const secondary =
    shortStrings.find(l => SECONDARY_KEY.test(leafName(l))) ??
    shortStrings[0]
  if (secondary) used.add(secondary.path)

  const valueOk = (l: Leaf) =>
    !used.has(l.path) &&
    typeof l.value !== 'boolean' &&
    (isNum(l.value) || (l.value as string).length <= 16)
  const cands = leaves.filter(valueOk)
  const value =
    cands.find(l => VALUE_KEY.test(leafName(l))) ??
    cands.find(l => isNum(l.value) && !ID_KEY.test(leafName(l))) ??
    cands.find(l => !ID_KEY.test(leafName(l)))

  const m: ListMapping = { itemsPath: found.path, primary: primary.path }
  if (secondary) m.secondary = secondary.path
  if (value) m.value = value.path
  return m
}

function numberMapping(root: unknown): NumberMapping | null {
  const hits: { path: string; parent: Obj }[] = []
  const visit = (o: Obj, path: string, depth: number): void => {
    for (const k of Object.keys(o)) {
      if (!safeKey(k)) continue
      const v = o[k]
      if (isNum(v)) {
        if (!IGNORED_NUMBER_KEYS.test(k))
          hits.push({ path: joinPath(path, k), parent: o })
      } else if (isObj(v) && depth + 1 < MAX_NUMBER_DEPTH)
        visit(v, joinPath(path, k), depth + 1)
    }
  }
  if (isObj(root)) visit(root, '', 0)
  if (hits.length !== 1) return null
  const { path, parent } = hits[0]
  const prefix = path.includes('.')
    ? path.slice(0, path.lastIndexOf('.') + 1)
    : ''
  const capKey = Object.keys(parent).find(
    k => safeKey(k) && CAPTION_KEY.test(k) && typeof parent[k] === 'string'
  )
  const m: NumberMapping = { value: path }
  if (capKey) m.caption = prefix + capKey
  return m
}

export function humanise(key: string): string {
  const s = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, MAX_LABEL)
}

function keyValueMapping(root: unknown): KeyValueMapping | null {
  let best: { path: string; keys: string[]; depth: number } | null = null
  const visit = (o: Obj, path: string, depth: number): void => {
    const keys = Object.keys(o).filter(k => safeKey(k) && isScalar(o[k]))
    if (keys.length > 0 && (!best || keys.length > best.keys.length))
      best = { path, keys, depth }
    if (depth < MAX_NUMBER_DEPTH)
      for (const k of Object.keys(o))
        if (safeKey(k) && isObj(o[k]))
          visit(o[k] as Obj, joinPath(path, k), depth + 1)
  }
  if (isObj(root)) visit(root, '', 0)
  if (!best) return null
  const b = best as { path: string; keys: string[] }
  const pairs = b.keys
    .map(k => ({ label: humanise(k), path: joinPath(b.path, k) }))
    .filter(p => p.label && p.path.length <= MAX_PATH)
    .slice(0, MAX_PAIRS)
  return pairs.length ? { pairs } : null
}

export function suggestMapping(
  sample: unknown
): { layout: Layout; mapping: Mapping } | null {
  const found = findLargestArray(sample)
  if (found) {
    const m = listMapping(found)
    if (m) return { layout: 'label' in m ? 'grid' : 'list', mapping: m }
  }
  const num = numberMapping(sample)
  if (num) return { layout: 'number', mapping: num }
  const kv = keyValueMapping(sample)
  if (kv) return { layout: 'keyvalue', mapping: kv }
  return null
}
