import { readdirSync, readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import {
  adapter,
  cwdBasename,
  id,
  label,
  sanitizeToolName,
  toStatus
} from './claude-code.js'

const dir = new URL('./fixtures/claude-code/', import.meta.url)

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8'))
}

function without(
  o: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const copy = { ...o }
  delete copy[key]
  return copy
}

const WIN = 'glance-app'
const POSIX = 'my-repo'
const s = (n: number): string => `sess-0000-${n}`
const base = { source: 'claude-code' }

const expected: Record<string, unknown> = {
  'session-start': {
    ...base,
    sessionId: s(1),
    label: WIN,
    state: 'idle',
    detail: 'Ready'
  },
  'user-prompt-submit': {
    ...base,
    sessionId: s(2),
    label: POSIX,
    state: 'working',
    detail: 'Working'
  },
  'pre-tool-use': {
    ...base,
    sessionId: s(3),
    label: WIN,
    state: 'working',
    detail: 'Running Bash'
  },
  'pre-tool-use-mcp': {
    ...base,
    sessionId: s(4),
    label: POSIX,
    state: 'working',
    detail: 'Running list_issues'
  },
  'post-tool-use': {
    ...base,
    sessionId: s(5),
    label: WIN,
    state: 'working',
    detail: 'Working'
  },
  'post-tool-use-failure': {
    ...base,
    sessionId: s(6),
    label: POSIX,
    state: 'working',
    detail: 'Working'
  },
  'subagent-stop': {
    ...base,
    sessionId: s(7),
    label: WIN,
    state: 'working',
    detail: 'Working'
  },
  'permission-request': {
    ...base,
    sessionId: s(8),
    label: POSIX,
    state: 'waiting',
    detail: 'Needs approval: Edit'
  },
  'notification-permission-prompt': {
    ...base,
    sessionId: s(9),
    label: WIN,
    state: 'waiting',
    detail: 'Needs approval'
  },
  'notification-elicitation-dialog': {
    ...base,
    sessionId: s(10),
    label: POSIX,
    state: 'waiting',
    detail: 'Waiting for you'
  },
  'notification-elicitation-url-dialog': {
    ...base,
    sessionId: s(11),
    label: WIN,
    state: 'waiting',
    detail: 'Waiting for you'
  },
  'notification-agent-needs-input': {
    ...base,
    sessionId: s(12),
    label: POSIX,
    state: 'waiting',
    detail: 'Waiting for you'
  },
  'notification-idle-prompt': {
    ...base,
    sessionId: s(13),
    label: WIN,
    state: 'idle',
    detail: 'Waiting for you'
  },
  'notification-auth-success': null,
  'notification-no-type': null,
  stop: {
    ...base,
    sessionId: s(16),
    label: POSIX,
    state: 'idle',
    detail: 'Done'
  },
  'stop-failure': {
    ...base,
    sessionId: s(17),
    label: WIN,
    state: 'idle',
    detail: 'Stopped with an error'
  },
  'session-end': {
    ...base,
    sessionId: s(18),
    state: 'stopped',
    detail: 'Session ended',
    end: true
  }
}

const fixtures = readdirSync(dir)
  .filter(f => f.endsWith('.json'))
  .map(f => f.slice(0, -5))
  .sort()

describe('claude-code toStatus', () => {
  it('exports the adapter shape', () => {
    expect(id).toBe('claude-code')
    expect(label).toBe('Claude')
    expect(adapter).toMatchObject({ id, label, toStatus })
    expect(adapter.setupSteps.length).toBeGreaterThan(0)
    expect(typeof adapter.configSnippet).toBe('function')
  })

  it('has an expectation for every fixture', () => {
    expect(fixtures).toEqual(Object.keys(expected).sort())
  })

  it.each(fixtures)('maps %s', name => {
    const payload = load(name)
    // Fixtures carry the leak marker in their free-text fields.
    expect(JSON.stringify(payload)).toContain('LEAKCHECK')
    expect(toStatus(payload)).toEqual(expected[name])
  })

  it.each(fixtures)('%s leaks no free text or path', name => {
    const out = JSON.stringify(toStatus(load(name)))
    expect(out).not.toContain('LEAKCHECK')
    expect(out).not.toContain('/')
    expect(out).not.toContain('\\')
    expect(out).not.toContain('someone')
  })

  it('ignores message text when notification_type is unknown', () => {
    const p = {
      ...load('notification-no-type'),
      notification_type: 'something_new'
    }
    expect(toStatus(p)).toBeNull()
  })

  it('sanitizes odd tool names', () => {
    const p = { ...load('pre-tool-use'), tool_name: 'Bash; rm -rf\n' }
    expect(toStatus(p)?.detail).toBe('Running Bashrm-rf')
  })

  it('caps a long tool name at 24 chars', () => {
    const p = { ...load('permission-request'), tool_name: 'A'.repeat(100) }
    expect(toStatus(p)?.detail).toBe(`Needs approval: ${'A'.repeat(24)}`)
  })

  it('falls back to a plain phrase when the tool name is empty after cleaning', () => {
    expect(
      toStatus({ ...load('pre-tool-use'), tool_name: '; ;' })?.detail
    ).toBe('Working')
    expect(
      toStatus({ ...load('permission-request'), tool_name: 42 })?.detail
    ).toBe('Needs approval')
  })

  it('caps the label through the validator', () => {
    const p = { ...load('stop'), cwd: `/x/${'b'.repeat(40)}` }
    expect(toStatus(p)?.label).toBe('b'.repeat(24))
  })

  it.each([
    ['C:\\', undefined],
    ['C:', undefined],
    ['/', undefined],
    ['', undefined],
    ['/home/x/repo/', 'repo'],
    ['C:\\Users\\x\\proj\\\\', 'proj'],
    ['D:/work/mixed\\app', 'app'],
    [42, undefined]
  ])('basename of %j is %j', (cwd, want) => {
    expect(cwdBasename(cwd)).toBe(want)
  })

  it('omits the label for a drive-root cwd', () => {
    const out = toStatus({ ...load('stop'), cwd: 'C:\\' })
    expect(out).not.toBeNull()
    expect(out).not.toHaveProperty('label')
  })

  it.each([
    ['mcp__github__list_issues', 'list_issues'],
    ['mcp__srv__', undefined],
    ['Read', 'Read'],
    ['Web Fetch!', 'WebFetch'],
    [null, undefined]
  ])('sanitizeToolName(%j) is %j', (n, want) => {
    expect(sanitizeToolName(n)).toBe(want)
  })

  it.each([
    ['unknown event', { ...load('stop'), hook_event_name: 'PreCompact' }],
    ['array', [load('stop')]],
    ['null', null],
    ['string', 'Stop'],
    ['number', 1],
    ['missing session_id', without(load('stop'), 'session_id')],
    ['non-string session_id', { ...load('stop'), session_id: 123 }],
    ['invalid session_id', { ...load('stop'), session_id: 'has space' }],
    ['missing event', without(load('stop'), 'hook_event_name')]
  ])('returns null for %s', (_name, payload) => {
    expect(toStatus(payload)).toBeNull()
  })

  it('returns null when a getter throws', () => {
    const p = { ...load('stop') }
    Object.defineProperty(p, 'session_id', {
      get() {
        throw new Error('boom')
      }
    })
    expect(toStatus(p)).toBeNull()
  })
})
