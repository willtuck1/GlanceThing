import { validateMapping, validateUrl } from '../connectors/validate.js'
import { Layout, LAYOUTS, Mapping } from '../connectors/types.js'

export type HostName = 'now' | 'today' | 'dayStart' | 'dayEnd'
export type HostFormat = 'iso' | 'date' | 'epochMs'

export type ArgValue =
  | string
  | number
  | boolean
  | null
  | ArgValue[]
  | { [key: string]: ArgValue }
  | {
      $host: HostName
      offsetDays?: number
      format?: HostFormat
    }
  | { $setting: string }

export interface RecipeSetting {
  key: string
  label: string
  placeholder?: string
  maxLength: number
}

export interface Recipe {
  id: string
  label: string
  description: string
  defaultServerUrl?: string
  intervalMin: number
  tool?: { name: string; args: Record<string, ArgValue> }
  resource?: { uri: string }
  settings: RecipeSetting[]
  layout: Layout
  mapping: Mapping
}

const HOSTS = ['now', 'today', 'dayStart', 'dayEnd']
const FORMATS = ['iso', 'date', 'epochMs']
const TOP_KEYS = [
  'id',
  'label',
  'description',
  'defaultServerUrl',
  'intervalMin',
  'tool',
  'resource',
  'settings',
  'layout',
  'mapping'
]

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

function checkArg(
  v: unknown,
  where: string,
  settingKeys: string[],
  depth: number
): void {
  if (depth > 5) throw new Error(`${where}: nested too deeply`)
  if (v === null || typeof v === 'boolean') return
  if (typeof v === 'number') {
    if (!Number.isFinite(v))
      throw new Error(`${where}: number is not finite`)
    return
  }
  if (typeof v === 'string') {
    if (v.length > 1000) throw new Error(`${where}: text is too long`)
    return
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) =>
      checkArg(x, `${where}[${i}]`, settingKeys, depth + 1)
    )
    return
  }
  if (!isObj(v)) throw new Error(`${where}: unsupported value`)
  if ('$host' in v) {
    onlyKeys(v, ['$host', 'offsetDays', 'format'], where)
    if (typeof v.$host !== 'string' || !HOSTS.includes(v.$host))
      throw new Error(`${where}: $host must be one of ${HOSTS.join(', ')}`)
    if (
      v.offsetDays !== undefined &&
      (!Number.isInteger(v.offsetDays) ||
        (v.offsetDays as number) < -30 ||
        (v.offsetDays as number) > 30)
    )
      throw new Error(`${where}: offsetDays must be an integer -30 to 30`)
    if (
      v.format !== undefined &&
      (typeof v.format !== 'string' || !FORMATS.includes(v.format))
    )
      throw new Error(
        `${where}: format must be one of ${FORMATS.join(', ')}`
      )
    return
  }
  if ('$setting' in v) {
    onlyKeys(v, ['$setting'], where)
    if (
      typeof v.$setting !== 'string' ||
      !settingKeys.includes(v.$setting)
    )
      throw new Error(`${where}: $setting names an undeclared setting`)
    return
  }
  for (const k of Object.keys(v)) {
    if (k.startsWith('$')) throw new Error(`${where}: unknown key "${k}"`)
    checkArg(v[k], `${where}.${k}`, settingKeys, depth + 1)
  }
}

export function parseRecipe(raw: unknown, fileId: string): Recipe {
  const r = obj(raw, 'Recipe')
  onlyKeys(r, TOP_KEYS, 'Recipe')
  const id = str(r.id, 'id', 1, 32)
  if (!/^[a-z0-9-]{1,32}$/.test(id))
    throw new Error('id must be lowercase letters, digits and dashes')
  if (id !== fileId) throw new Error(`id "${id}" must match the file name`)
  const label = str(r.label, 'label', 1, 24)
  const description = str(r.description, 'description', 0, 200)

  let defaultServerUrl: string | undefined
  if (r.defaultServerUrl !== undefined) {
    try {
      validateUrl(r.defaultServerUrl)
    } catch (e) {
      throw new Error(`defaultServerUrl: ${(e as Error).message}`)
    }
    defaultServerUrl = r.defaultServerUrl as string
  }

  const intervalMin = r.intervalMin
  if (
    typeof intervalMin !== 'number' ||
    !Number.isInteger(intervalMin) ||
    intervalMin < 1 ||
    intervalMin > 1440
  )
    throw new Error('intervalMin must be a whole number from 1 to 1440')

  if ((r.tool === undefined) === (r.resource === undefined))
    throw new Error('Recipe needs exactly one of "tool" or "resource"')

  const settingsRaw = r.settings ?? []
  if (!Array.isArray(settingsRaw))
    throw new Error('settings must be a list')
  if (settingsRaw.length > 5) throw new Error('settings: at most 5')
  const settings: RecipeSetting[] = []
  settingsRaw.forEach((s, i) => {
    const w = `settings[${i}]`
    const o = obj(s, w)
    onlyKeys(o, ['key', 'label', 'placeholder', 'maxLength'], w)
    const key = str(o.key, `${w}.key`, 1, 32)
    if (!/^[a-zA-Z]\w{0,31}$/.test(key))
      throw new Error(`${w}.key is not a valid name`)
    if (settings.some(x => x.key === key))
      throw new Error(`${w}.key "${key}" is duplicated`)
    const lbl = str(o.label, `${w}.label`, 1, 40)
    let placeholder: string | undefined
    if (o.placeholder !== undefined)
      placeholder = str(o.placeholder, `${w}.placeholder`, 0, 100)
    let maxLength = 200
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
      maxLength = o.maxLength
    }
    const out: RecipeSetting = { key, label: lbl, maxLength }
    if (placeholder !== undefined) out.placeholder = placeholder
    settings.push(out)
  })
  const settingKeys = settings.map(s => s.key)

  let tool: Recipe['tool']
  let resource: Recipe['resource']
  if (r.tool !== undefined) {
    const t = obj(r.tool, 'tool')
    onlyKeys(t, ['name', 'args'], 'tool')
    const name = str(t.name, 'tool.name', 1, 128)
    if (!/^[A-Za-z0-9_.\-/]{1,128}$/.test(name))
      throw new Error('tool.name has characters that are not allowed')
    const args = t.args === undefined ? {} : obj(t.args, 'tool.args')
    for (const k of Object.keys(args)) {
      if (k.startsWith('$'))
        throw new Error(`tool.args: unknown key "${k}"`)
      checkArg(args[k], `tool.args.${k}`, settingKeys, 1)
    }
    tool = { name, args: args as Record<string, ArgValue> }
  } else {
    const o = obj(r.resource, 'resource')
    onlyKeys(o, ['uri'], 'resource')
    resource = { uri: str(o.uri, 'resource.uri', 1, 512) }
  }

  if (!LAYOUTS.includes(r.layout as Layout))
    throw new Error('layout is unknown')
  let vm
  try {
    vm = validateMapping(r.layout, r.mapping)
  } catch (e) {
    throw new Error(`mapping: ${(e as Error).message}`)
  }

  const recipe: Recipe = {
    id,
    label,
    description,
    intervalMin,
    settings,
    layout: vm.layout,
    mapping: vm.mapping
  }
  if (defaultServerUrl !== undefined)
    recipe.defaultServerUrl = defaultServerUrl
  if (tool) recipe.tool = tool
  if (resource) recipe.resource = resource
  return recipe
}

export interface RecipeLoad {
  recipes: Recipe[]
  errors: { file: string; message: string }[]
}

export function loadRecipesFrom(
  files: Record<string, unknown>
): RecipeLoad {
  const recipes: Recipe[] = []
  const errors: RecipeLoad['errors'] = []
  for (const path of Object.keys(files).sort()) {
    const file = path.split('/').pop() ?? path
    try {
      const recipe = parseRecipe(files[path], file.replace(/\.json$/, ''))
      if (recipes.some(x => x.id === recipe.id))
        throw new Error(`Duplicate recipe id "${recipe.id}"`)
      recipes.push(recipe)
    } catch (e) {
      errors.push({ file, message: (e as Error).message })
    }
  }
  return { recipes, errors }
}

export function loadRecipes(): RecipeLoad {
  return loadRecipesFrom(
    import.meta.glob('../connectors/recipes/*.json', {
      eager: true,
      import: 'default'
    }) as Record<string, unknown>
  )
}

let cache: RecipeLoad | null = null

function load(): RecipeLoad {
  if (!cache) cache = loadRecipes()
  return cache
}

export function listRecipes(): Recipe[] {
  return load().recipes
}

export function getRecipe(id: string): Recipe | undefined {
  return load().recipes.find(r => r.id === id)
}

export function __setRecipesForTest(
  map: Record<string, unknown> | null
): void {
  cache = map ? loadRecipesFrom(map) : null
}
