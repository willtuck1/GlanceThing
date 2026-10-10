import { LAYOUTS, Layout } from './types.js'
import type {
  Preset,
  PresetField,
  PresetFieldKind,
  PresetLookupJson
} from './presetTypes.js'
import { parsePath } from './path.js'
import { checkTemplate, templatePlaceholders } from './template.js'
import {
  validateHeaderName,
  validateInterval,
  validateMapping
} from './validate.js'

const TOP_KEYS = [
  'id',
  'label',
  'description',
  'help',
  'signUpUrl',
  'url',
  'layout',
  'mapping',
  'intervalMin',
  'fields'
]
const FIELD_KEYS = [
  'key',
  'label',
  'kind',
  'help',
  'placeholder',
  'optional',
  'maxLength',
  'headerName',
  'headerPrefix',
  'options',
  'lookup'
]
const KINDS: PresetFieldKind[] = ['text', 'secret', 'choice', 'baseUrl']

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function obj(v: unknown, what: string): Record<string, unknown> {
  if (!isObj(v)) throw new Error(`${what} must be an object`)
  return v
}

function str(v: unknown, what: string, min: number, max: number): string {
  if (typeof v !== 'string') throw new Error(`${what} must be text`)
  if (v.length < min || v.length > max)
    throw new Error(
      `${what} must be ${min === max ? max : `${min}-${max}`} characters`
    )
  return v
}

function onlyKeys(o: Record<string, unknown>, ok: string[], what: string) {
  for (const k of Object.keys(o))
    if (!ok.includes(k)) throw new Error(`${what}: unknown key "${k}"`)
}

function path(v: unknown, what: string): string {
  const s = str(v, what, 0, 200)
  try {
    parsePath(s)
  } catch {
    throw new Error(`${what} is not a valid path`)
  }
  return s
}

function parseLookup(
  raw: unknown,
  w: string,
  earlier: PresetField[]
): NonNullable<PresetField['lookup']> {
  const o = obj(raw, w)
  if (o.kind === 'geocode') {
    onlyKeys(o, ['kind'], w)
    return { kind: 'geocode' }
  }
  if (o.kind !== 'json')
    throw new Error(`${w}.kind must be "json" or "geocode"`)
  onlyKeys(
    o,
    ['kind', 'url', 'itemsPath', 'labelPath', 'valuePath', 'dependsOn'],
    w
  )
  const url = str(o.url, `${w}.url`, 1, 2000)
  const itemsPath = path(o.itemsPath, `${w}.itemsPath`)
  const labelPath = path(o.labelPath, `${w}.labelPath`)
  const valuePath = path(o.valuePath, `${w}.valuePath`)
  try {
    checkTemplate(url, earlier)
  } catch (e) {
    throw new Error(`${w}.url: ${(e as Error).message}`)
  }
  const used = [
    ...new Set(templatePlaceholders(url).map(n => n.split('.')[0]))
  ]
  let dependsOn: string[]
  if (o.dependsOn === undefined) {
    dependsOn = used
  } else {
    if (!Array.isArray(o.dependsOn))
      throw new Error(`${w}.dependsOn must be a list`)
    dependsOn = o.dependsOn.map((k, i) => {
      const key = str(k, `${w}.dependsOn[${i}]`, 1, 32)
      if (!earlier.some(f => f.key === key))
        throw new Error(
          `${w}.dependsOn "${key}" must name an earlier field`
        )
      return key
    })
    for (const k of used)
      if (!dependsOn.includes(k))
        throw new Error(
          `${w}.dependsOn must list "${k}" (used in the URL)`
        )
  }
  const out: PresetLookupJson = {
    kind: 'json',
    url,
    itemsPath,
    labelPath,
    valuePath,
    dependsOn
  }
  return out
}

function parseField(
  raw: unknown,
  i: number,
  earlier: PresetField[]
): PresetField {
  const w = `fields[${i}]`
  const o = obj(raw, w)
  onlyKeys(o, FIELD_KEYS, w)
  const key = str(o.key, `${w}.key`, 1, 32)
  if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(key))
    throw new Error(`${w}.key is not a valid name`)
  if (earlier.some(f => f.key === key))
    throw new Error(`${w}.key "${key}" is duplicated`)
  const label = str(o.label, `${w}.label`, 1, 40)
  if (
    typeof o.kind !== 'string' ||
    !KINDS.includes(o.kind as PresetFieldKind)
  )
    throw new Error(`${w}.kind must be one of ${KINDS.join(', ')}`)
  const kind = o.kind as PresetFieldKind
  const f: PresetField = { key, label, kind }
  if (o.help !== undefined) f.help = str(o.help, `${w}.help`, 0, 300)
  if (o.placeholder !== undefined)
    f.placeholder = str(o.placeholder, `${w}.placeholder`, 0, 80)

  const only = (name: string, ok: boolean) => {
    if (o[name] !== undefined && !ok)
      throw new Error(`${w}.${name} isn't allowed on a ${kind} field`)
  }
  only('optional', kind === 'text' || kind === 'choice')
  only('maxLength', kind === 'text')
  only('headerName', kind === 'secret')
  only('headerPrefix', kind === 'secret')
  only('options', kind === 'choice')
  only('lookup', kind === 'choice')

  if (o.optional !== undefined) {
    if (typeof o.optional !== 'boolean')
      throw new Error(`${w}.optional must be true or false`)
    f.optional = o.optional
  }
  if (o.maxLength !== undefined) {
    if (
      typeof o.maxLength !== 'number' ||
      !Number.isInteger(o.maxLength) ||
      o.maxLength < 1 ||
      o.maxLength > 200
    )
      throw new Error(
        `${w}.maxLength must be a whole number from 1 to 200`
      )
    f.maxLength = o.maxLength
  }
  if (kind === 'secret') {
    if (o.headerName === undefined)
      throw new Error(`${w}.headerName is required for a secret field`)
    try {
      f.headerName = validateHeaderName(o.headerName)
    } catch (e) {
      throw new Error(`${w}.headerName: ${(e as Error).message}`)
    }
    if (o.headerPrefix !== undefined) {
      const p = str(o.headerPrefix, `${w}.headerPrefix`, 0, 20)
      if (!/^[\x20-\x7e]*$/.test(p))
        throw new Error(`${w}.headerPrefix must be printable ASCII`)
      f.headerPrefix = p
    }
  }
  if (kind === 'choice') {
    if ((o.options === undefined) === (o.lookup === undefined))
      throw new Error(`${w} needs exactly one of "options" or "lookup"`)
    if (o.options !== undefined) {
      if (!Array.isArray(o.options))
        throw new Error(`${w}.options must be a list`)
      if (o.options.length < 1 || o.options.length > 50)
        throw new Error(`${w}.options: 1-50 entries`)
      f.options = o.options.map((x, j) => {
        const ow = `${w}.options[${j}]`
        const e = obj(x, ow)
        onlyKeys(e, ['label', 'value'], ow)
        return {
          label: str(e.label, `${ow}.label`, 1, 80),
          value: str(e.value, `${ow}.value`, 1, 200)
        }
      })
    } else {
      f.lookup = parseLookup(o.lookup, `${w}.lookup`, earlier)
    }
  }
  return f
}

export function parsePreset(raw: unknown, fileId: string): Preset {
  const r = obj(raw, 'Preset')
  onlyKeys(r, TOP_KEYS, 'Preset')
  const id = str(r.id, 'id', 1, 32)
  if (!/^[a-z0-9-]{1,32}$/.test(id))
    throw new Error('id must be lowercase letters, digits and dashes')
  if (id !== fileId) throw new Error(`id "${id}" must match the file name`)
  // Becomes the default connector name, so the same cap as validateLabel.
  const label = str(r.label, 'label', 1, 24)
  const description = str(r.description, 'description', 0, 200)
  const help = str(r.help, 'help', 0, 600)

  let signUpUrl: string | undefined
  if (r.signUpUrl !== undefined) {
    const s = str(r.signUpUrl, 'signUpUrl', 1, 500)
    let u: URL
    try {
      u = new URL(s)
    } catch {
      throw new Error('signUpUrl is not a valid address')
    }
    if (u.protocol !== 'https:' || u.username || u.password)
      throw new Error('signUpUrl must be an https:// address')
    signUpUrl = s
  }

  const url = str(r.url, 'url', 1, 2000)

  if (!LAYOUTS.includes(r.layout as Layout))
    throw new Error('layout is unknown')
  let vm
  try {
    vm = validateMapping(r.layout, r.mapping)
  } catch (e) {
    throw new Error(`mapping: ${(e as Error).message}`)
  }
  let intervalMin: number
  try {
    intervalMin = validateInterval(r.intervalMin)
  } catch (e) {
    throw new Error(`intervalMin: ${(e as Error).message}`)
  }

  const fieldsRaw = r.fields ?? []
  if (!Array.isArray(fieldsRaw)) throw new Error('fields must be a list')
  if (fieldsRaw.length > 5) throw new Error('fields: at most 5')
  const fields: PresetField[] = []
  fieldsRaw.forEach((x, i) => fields.push(parseField(x, i, fields)))
  if (fields.filter(f => f.kind === 'secret').length > 1)
    throw new Error('fields: at most one secret field')
  if (fields.filter(f => f.kind === 'baseUrl').length > 1)
    throw new Error('fields: at most one baseUrl field')

  try {
    checkTemplate(url, fields)
  } catch (e) {
    throw new Error(`url: ${(e as Error).message}`)
  }

  const preset: Preset = {
    id,
    label,
    description,
    help,
    url,
    layout: vm.layout,
    mapping: vm.mapping,
    intervalMin,
    fields
  }
  if (signUpUrl !== undefined) preset.signUpUrl = signUpUrl
  return preset
}

export interface PresetLoad {
  presets: Preset[]
  errors: { file: string; message: string }[]
}

export function loadPresetsFrom(
  files: Record<string, unknown>
): PresetLoad {
  const presets: Preset[] = []
  const errors: PresetLoad['errors'] = []
  for (const path of Object.keys(files).sort()) {
    const file = path.split('/').pop() ?? path
    try {
      const preset = parsePreset(files[path], file.replace(/\.json$/, ''))
      if (presets.some(x => x.id === preset.id))
        throw new Error(`Duplicate preset id "${preset.id}"`)
      presets.push(preset)
    } catch (e) {
      errors.push({ file, message: (e as Error).message })
    }
  }
  return { presets, errors }
}

export function loadPresets(): PresetLoad {
  return loadPresetsFrom(
    import.meta.glob('./presets/*.json', {
      eager: true,
      import: 'default'
    }) as Record<string, unknown>
  )
}

let cache: PresetLoad | null = null

function load(): PresetLoad {
  if (!cache) cache = loadPresets()
  return cache
}

export function listPresets(): Preset[] {
  return load().presets
}

export function getPreset(id: string): Preset | undefined {
  return load().presets.find(p => p.id === id)
}

export function __setPresetsForTest(
  map: Record<string, unknown> | null
): void {
  cache = map ? loadPresetsFrom(map) : null
}
