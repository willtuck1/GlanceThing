import { afterEach, describe, expect, it } from 'vitest'
import {
  __setPresetsForTest,
  getPreset,
  listPresets,
  loadPresets,
  loadPresetsFrom,
  parsePreset
} from './presets.js'

type P = Record<string, unknown> & { fields?: unknown[] }

const base = (): P => ({
  id: 'x',
  label: 'X',
  description: 'd',
  help: 'h',
  signUpUrl: 'https://example.com/signup',
  url: 'https://api.example.com/v1/items',
  layout: 'list',
  mapping: { itemsPath: '', primary: 'a' },
  intervalMin: 5,
  fields: []
})

const withFields = (fields: P[], url?: string): P => {
  const p = base()
  p.fields = fields
  if (url) p.url = url
  return p
}

const secret = {
  key: 'token',
  label: 'Token',
  kind: 'secret',
  headerName: 'Authorization',
  headerPrefix: 'Bearer '
}

afterEach(() => __setPresetsForTest(null))

describe('committed presets', () => {
  it('every committed preset parses', () => {
    const { presets, errors } = loadPresets()
    expect(errors).toEqual([])
    expect(listPresets().length).toBe(presets.length)
  })
})

describe('parsePreset accepts', () => {
  it('a plain preset', () => {
    expect(parsePreset(base(), 'x').id).toBe('x')
  })
  it('one of each field kind', () => {
    const p = parsePreset(
      withFields(
        [
          { key: 'base', label: 'Server', kind: 'baseUrl' },
          { ...secret },
          {
            key: 'name',
            label: 'Name',
            kind: 'text',
            optional: true,
            maxLength: 50
          },
          {
            key: 'unit',
            label: 'Unit',
            kind: 'choice',
            options: [{ label: 'Metric', value: 'm' }]
          },
          {
            key: 'city',
            label: 'City',
            kind: 'choice',
            lookup: { kind: 'geocode' }
          }
        ],
        '{{base}}/api?u={{unit}}&lat={{city.lat}}&lon={{city.lon}}&n={{name}}'
      ),
      'x'
    )
    expect(p.fields).toHaveLength(5)
  })
  it('a json lookup and fills dependsOn automatically', () => {
    const p = parsePreset(
      withFields([
        { key: 'user', label: 'User', kind: 'text' },
        {
          key: 'repo',
          label: 'Repo',
          kind: 'choice',
          lookup: {
            kind: 'json',
            url: 'https://api.example.com/users/{{user}}/repos',
            itemsPath: 'data',
            labelPath: 'name',
            valuePath: 'id'
          }
        }
      ]),
      'x'
    )
    const lk = p.fields[1].lookup as { dependsOn?: string[] }
    expect(lk.dependsOn).toEqual(['user'])
  })
})

describe('parsePreset rejects', () => {
  const bad = (p: P, re: RegExp, id = 'x') =>
    expect(() => parsePreset(p, id)).toThrow(re)

  it('an id that differs from the file name', () => {
    bad(base(), /file name/, 'y')
  })
  it('unknown keys', () => {
    bad({ ...base(), extra: 1 }, /unknown key/)
    bad(
      withFields([{ key: 'a', label: 'A', kind: 'text', nope: 1 }]),
      /unknown key/
    )
  })
  it('six fields', () => {
    const f = ['a', 'b', 'c', 'd', 'e', 'f'].map(key => ({
      key,
      label: key,
      kind: 'text'
    }))
    bad(withFields(f), /at most 5/)
  })
  it('two secrets', () => {
    bad(withFields([secret, { ...secret, key: 'other' }]), /one secret/)
  })
  it('a secret in the url template', () => {
    bad(withFields([secret], 'https://a.example.com/?k={{token}}'), /Secret/)
  })
  it('a secret in a lookup url', () => {
    bad(
      withFields([
        secret,
        {
          key: 'c',
          label: 'C',
          kind: 'choice',
          lookup: {
            kind: 'json',
            url: 'https://a.example.com/?k={{token}}',
            itemsPath: '',
            labelPath: 'n',
            valuePath: 'v'
          }
        }
      ]),
      /Secret/
    )
  })
  it('a lookup that references a later field', () => {
    bad(
      withFields([
        {
          key: 'c',
          label: 'C',
          kind: 'choice',
          lookup: {
            kind: 'json',
            url: 'https://a.example.com/?q={{later}}',
            itemsPath: '',
            labelPath: 'n',
            valuePath: 'v'
          }
        },
        { key: 'later', label: 'L', kind: 'text' }
      ]),
      /Unknown placeholder/
    )
  })
  it('a dependsOn that names a later field', () => {
    bad(
      withFields([
        {
          key: 'c',
          label: 'C',
          kind: 'choice',
          lookup: {
            kind: 'json',
            url: 'https://a.example.com/',
            itemsPath: '',
            labelPath: 'n',
            valuePath: 'v',
            dependsOn: ['later']
          }
        },
        { key: 'later', label: 'L', kind: 'text' }
      ]),
      /earlier field/
    )
  })
  it('a mapping that does not fit the layout', () => {
    bad({ ...base(), layout: 'number' }, /mapping/)
  })
  it('an http signUpUrl', () => {
    bad({ ...base(), signUpUrl: 'http://example.com' }, /https/)
  })
  it('an http literal url without a baseUrl field', () => {
    bad({ ...base(), url: 'http://api.example.com/x' }, /https:\/\//)
  })
  it('a choice with both options and lookup', () => {
    bad(
      withFields([
        {
          key: 'c',
          label: 'C',
          kind: 'choice',
          options: [{ label: 'A', value: 'a' }],
          lookup: { kind: 'geocode' }
        }
      ]),
      /exactly one/
    )
  })
  it('maxLength on a choice', () => {
    bad(
      withFields([
        {
          key: 'c',
          label: 'C',
          kind: 'choice',
          maxLength: 10,
          options: [{ label: 'A', value: 'a' }]
        }
      ]),
      /maxLength/
    )
  })
  it('duplicate keys', () => {
    bad(
      withFields([
        { key: 'a', label: 'A', kind: 'text' },
        { key: 'a', label: 'B', kind: 'text' }
      ]),
      /duplicated/
    )
  })
  it('a secret without a header name', () => {
    bad(
      withFields([{ key: 's', label: 'S', kind: 'secret' }]),
      /headerName/
    )
  })
})

describe('loadPresetsFrom', () => {
  it('reports a duplicate preset id across files', () => {
    const { presets, errors } = loadPresetsFrom({
      './presets/x.json': base(),
      './other/x.json': base()
    })
    expect(presets).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/Duplicate/)
  })
  it('serves injected presets', () => {
    __setPresetsForTest({ './presets/x.json': base() })
    expect(getPreset('x')?.label).toBe('X')
    expect(listPresets()).toHaveLength(1)
  })
})
