import { describe, expect, it } from 'vitest'
import { HOOK_EVENTS } from './claude-code.js'
import { adapterLabel, adapters, findAdapter } from './registry.js'
import { hookCommand } from '../snippets.js'

const token = 'cd'.repeat(32)

describe('adapter registry', () => {
  it('ids are unique and well formed, labels short', () => {
    const ids = adapters.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of adapters) {
      expect(a.id).toMatch(/^[a-z0-9-]{1,24}$/)
      expect(a.label.length).toBeLessThanOrEqual(8)
      expect(a.setupSteps.length).toBeGreaterThan(0)
      const snippet = a.configSnippet(47816, token)
      expect(snippet).not.toBe('')
      expect(snippet).toContain(token)
      expect(snippet).toContain('47816')
    }
  })

  it('claude-code snippet is valid hooks JSON', () => {
    const snippet = findAdapter('claude-code')!.configSnippet(47816, token)
    const json = JSON.parse(snippet)
    const expected = hookCommand('claude-code', 47816, token)
    for (const event of HOOK_EVENTS) {
      const entry = json.hooks[event][0].hooks[0]
      expect(entry.type).toBe('command')
      expect(entry.command).toBe(expected)
      expect(entry.timeout).toBe(5)
    }
    expect(Object.keys(json.hooks)).toHaveLength(HOOK_EVENTS.length)
  })

  it('adapterLabel falls back to a source prefix', () => {
    expect(adapterLabel('claude-code')).toBe('Claude')
    expect(adapterLabel('custom-runner-x')).toBe('custom-r')
  })
})
