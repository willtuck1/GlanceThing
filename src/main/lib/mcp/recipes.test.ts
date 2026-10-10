import { describe, expect, it } from 'vitest'
import {
  loadRecipes,
  loadRecipesFrom,
  parseRecipe,
  listRecipes,
  getRecipe
} from './recipes.js'

const base = () => ({
  id: 'x',
  label: 'X',
  description: 'd',
  intervalMin: 5,
  tool: { name: 't', args: {} },
  settings: [{ key: 'list', label: 'List', maxLength: 10 }],
  layout: 'list',
  mapping: { itemsPath: '', primary: 'a' }
})

describe('committed recipes', () => {
  it('all load without errors', () => {
    const { recipes, errors } = loadRecipes()
    expect(errors).toEqual([])
    expect(recipes.length).toBeGreaterThan(0)
    expect(getRecipe('example-tasks')).toBeDefined()
    expect(listRecipes().length).toBe(recipes.length)
  })
})

describe('parseRecipe', () => {
  it('accepts a valid recipe', () => {
    expect(parseRecipe(base(), 'x').id).toBe('x')
  })
  it('rejects both or neither of tool/resource', () => {
    expect(() =>
      parseRecipe({ ...base(), resource: { uri: 'a://b' } }, 'x')
    ).toThrow(/exactly one/)
    const n: Record<string, unknown> = base()
    delete n.tool
    expect(() => parseRecipe(n, 'x')).toThrow(/exactly one/)
  })
  it('accepts a resource', () => {
    const n: Record<string, unknown> = base()
    delete n.tool
    n.resource = { uri: 'a://b' }
    expect(parseRecipe(n, 'x').resource?.uri).toBe('a://b')
  })
  it('rejects a bad $host', () => {
    const r = base()
    r.tool.args = { a: { $host: 'tomorrow' } }
    expect(() => parseRecipe(r, 'x')).toThrow(/\$host/)
  })
  it('rejects an undeclared $setting', () => {
    const r = base()
    r.tool.args = { a: { $setting: 'nope' } }
    expect(() => parseRecipe(r, 'x')).toThrow(/undeclared/)
  })
  it('rejects $eval, also nested', () => {
    const r = base()
    r.tool.args = { a: [{ b: { $eval: '1' } }] }
    expect(() => parseRecipe(r, 'x')).toThrow(/\$eval/)
  })
  it('rejects extra keys on $host and at top level', () => {
    const r = base()
    r.tool.args = { a: { $host: 'now', extra: 1 } }
    expect(() => parseRecipe(r, 'x')).toThrow(/extra/)
    expect(() => parseRecipe({ ...base(), nope: 1 }, 'x')).toThrow(/nope/)
  })
  it('rejects a bad offsetDays', () => {
    const r = base()
    r.tool.args = { a: { $host: 'now', offsetDays: 31 } }
    expect(() => parseRecipe(r, 'x')).toThrow(/offsetDays/)
  })
  it('rejects a fileId mismatch', () => {
    expect(() => parseRecipe(base(), 'y')).toThrow(/file name/)
  })
  it('rejects a bad mapping', () => {
    expect(() =>
      parseRecipe({ ...base(), mapping: { itemsPath: '' } }, 'x')
    ).toThrow(/mapping/)
  })
  it('rejects duplicate setting keys and bad url', () => {
    const s = { key: 'a', label: 'A', maxLength: 5 }
    expect(() =>
      parseRecipe({ ...base(), settings: [s, s] }, 'x')
    ).toThrow(/duplicated/)
    expect(() =>
      parseRecipe({ ...base(), defaultServerUrl: 'ftp://x' }, 'x')
    ).toThrow(/defaultServerUrl/)
  })
})

describe('loadRecipesFrom', () => {
  it('collects errors and duplicates without throwing', () => {
    const { recipes, errors } = loadRecipesFrom({
      './a/x.json': base(),
      './b/x.json': base(),
      './y.json': { id: 'z' }
    })
    expect(recipes.length).toBe(1)
    expect(errors.length).toBe(2)
  })
})
