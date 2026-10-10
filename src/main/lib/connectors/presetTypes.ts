import type { Layout, Mapping } from './types.js'

export type PresetFieldKind = 'text' | 'secret' | 'choice' | 'baseUrl'

export interface PresetLookupJson {
  kind: 'json'
  url: string // URL template (same rules as Preset.url)
  itemsPath: string // path to the array ('' = root)
  labelPath: string // relative to each item
  valuePath: string // relative to each item
  dependsOn?: string[] // keys of EARLIER fields that must be filled first
}

// City search via the weather geocoder; value = "<lat>,<lon>"
export interface PresetLookupGeocode {
  kind: 'geocode'
}

export interface PresetField {
  key: string // ^[a-z][a-zA-Z0-9]{0,31}$, unique
  label: string // <=40 chars
  kind: PresetFieldKind
  help?: string // <=300 chars
  placeholder?: string // <=80 chars
  optional?: boolean // text/choice only; default required
  maxLength?: number // text only, 1-200, default 100
  // secret only (at most one secret field per preset):
  headerName?: string // required for secret, valid header name
  headerPrefix?: string // e.g. "Bearer " — prepended to the typed value
  // choice only: exactly one of options / lookup
  options?: { label: string; value: string }[] // 1-50 static options
  lookup?: PresetLookupJson | PresetLookupGeocode
}

export interface Preset {
  id: string // = file name, ^[a-z0-9-]{1,32}$
  label: string // <=40
  description: string // <=200
  help: string // <=600, plain text
  signUpUrl?: string // https only
  url: string // URL template
  layout: Layout
  mapping: Mapping // must pass validateMapping(layout, mapping)
  intervalMin: number // 1-1440
  fields: PresetField[] // 0-5
}
