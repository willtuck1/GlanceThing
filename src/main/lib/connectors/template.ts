import type { PresetField } from './presetTypes.js'
import { validateUrl } from './validate.js'

// URL templates for presets: `{{key}}` placeholders, `{{key.lat}}` /
// `{{key.lon}}` for a geocode choice field, and a baseUrl field only at the
// very start. Error messages name fields or placeholders, never values.

const NAME = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z]+)?$/

interface Token {
  name: string
  start: number
  end: number
}

function tokens(tpl: string): Token[] {
  const out: Token[] = []
  let i = 0
  for (;;) {
    const open = tpl.indexOf('{{', i)
    const close = tpl.indexOf('}}', i)
    if (open < 0) {
      if (close >= 0) throw new Error('Template has "}}" without "{{"')
      return out
    }
    if (close >= 0 && close < open)
      throw new Error('Template has "}}" without "{{"')
    const end = tpl.indexOf('}}', open + 2)
    if (end < 0) throw new Error('Template has "{{" without "}}"')
    const name = tpl.slice(open + 2, end)
    if (!NAME.test(name))
      throw new Error('Template has a malformed placeholder')
    out.push({ name, start: open, end: end + 2 })
    i = end + 2
  }
}

export function templatePlaceholders(tpl: string): string[] {
  return tokens(tpl).map(t => t.name)
}

function isGeocode(f: PresetField): boolean {
  return f.kind === 'choice' && f.lookup?.kind === 'geocode'
}

function splitName(name: string): { key: string; suffix?: string } {
  const dot = name.indexOf('.')
  return dot < 0
    ? { key: name }
    : { key: name.slice(0, dot), suffix: name.slice(dot + 1) }
}

export function checkTemplate(tpl: string, fields: PresetField[]): void {
  if (typeof tpl !== 'string' || !tpl) throw new Error('URL is required')
  const toks = tokens(tpl)
  const byKey = new Map(fields.map(f => [f.key, f]))
  for (const t of toks) {
    const { key, suffix } = splitName(t.name)
    const f = byKey.get(key)
    if (!f) throw new Error(`Unknown placeholder "${key}"`)
    if (f.kind === 'secret')
      throw new Error(`Secret field "${key}" can't be used in a URL`)
    if (f.kind === 'baseUrl') {
      if (suffix || t.start !== 0)
        throw new Error(
          `Base URL field "${key}" must be at the very start of the URL`
        )
      continue
    }
    if (isGeocode(f)) {
      if (suffix !== 'lat' && suffix !== 'lon')
        throw new Error(
          `Location field "${key}" must be used as "${key}.lat" or "${key}.lon"`
        )
    } else if (suffix) {
      throw new Error(`Placeholder "${key}" can't have a suffix`)
    }
  }

  const hash = tpl.indexOf('#')
  if (hash >= 0 && toks.some(t => t.end > hash))
    throw new Error('Placeholders can only be in the URL path or query')

  const first = toks[0]
  if (first && byKey.get(first.name)?.kind === 'baseUrl') {
    const rest = tpl.charAt(first.end)
    if (rest && rest !== '/' && rest !== '?')
      throw new Error('The base URL must be followed by "/" or "?"')
    return
  }

  if (!tpl.startsWith('https://'))
    throw new Error('URL must start with https://')
  const after = tpl.slice('https://'.length)
  const m = after.search(/[/?#]/)
  const hostEnd = 'https://'.length + (m < 0 ? after.length : m)
  if (toks.some(t => t.start < hostEnd))
    throw new Error('Placeholders can only be in the URL path or query')
}

function baseOrigin(raw: string, label: string): string {
  const bad = new Error(
    `"${label}" must be an http:// or https:// address with nothing after the host`
  )
  const s = raw.replace(/\/+$/, '')
  if (/[?#]/.test(s)) throw bad
  let u: URL
  try {
    u = new URL(s)
  } catch {
    throw bad
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw bad
  if (u.username || u.password || !u.hostname) throw bad
  if (u.pathname !== '/' || u.search || u.hash) throw bad
  return u.origin
}

const COORD = /^-?\d{1,3}(\.\d+)?$/

function coord(raw: string, label: string, suffix: string): string {
  const bad = new Error(`"${label}" is not a valid location`)
  const parts = raw.split(',').map(p => p.trim())
  if (parts.length !== 2 || !parts.every(p => COORD.test(p))) throw bad
  const lat = Number(parts[0])
  const lon = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw bad
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) throw bad
  return String(suffix === 'lat' ? lat : lon)
}

function isDotSegment(seg: string): boolean {
  const s = seg.replace(/%2e/gi, '.')
  return s === '.' || s === '..'
}

export function fillTemplate(
  tpl: string,
  fields: PresetField[],
  values: Record<string, string>
): string {
  checkTemplate(tpl, fields)
  const byKey = new Map(fields.map(f => [f.key, f]))
  let out = ''
  let last = 0
  let pathStart = -1
  for (const t of tokens(tpl)) {
    out += tpl.slice(last, t.start)
    last = t.end
    const { key, suffix } = splitName(t.name)
    const f = byKey.get(key)!
    const raw = values[key]
    const v = typeof raw === 'string' ? raw.trim() : ''
    if (!v) {
      if (f.optional && f.kind !== 'baseUrl') continue
      throw new Error(`"${f.label}" is required`)
    }
    if (f.kind === 'baseUrl') {
      out += baseOrigin(v, f.label)
      pathStart = out.length
    } else if (suffix) {
      out += coord(v, f.label, suffix)
    } else {
      out += encodeURIComponent(v)
    }
  }
  out += tpl.slice(last)

  if (pathStart < 0) {
    const m = out.slice('https://'.length).search(/[/?#]/)
    pathStart = m < 0 ? out.length : 'https://'.length + m
  }
  const tail = out.slice(pathStart)
  const q = tail.search(/[?#]/)
  const path = q < 0 ? tail : tail.slice(0, q)
  if (path.split('/').some(isDotSegment))
    throw new Error('A value can\'t be "." or ".."')

  return validateUrl(out).toString()
}
