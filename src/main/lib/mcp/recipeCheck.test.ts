import { execFileSync, spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const script = resolve('scripts/mcp-recipe-check.mjs')
const fixture = resolve('src/main/lib/mcp/fixtures/tools-list.json')

const run = (...args: string[]) =>
  spawnSync('node', [script, ...args], { encoding: 'utf8' })

describe('mcp-recipe-check', () => {
  it('tools splits read-only and refused', () => {
    const out = JSON.parse(
      execFileSync('node', [script, 'tools', fixture]).toString()
    )
    const names = out.readOnly.map((t: { name: string }) => t.name)
    expect(names).toContain('list_tasks')
    expect(names).not.toContain('delete_task')
    expect(out.refused).toContainEqual({
      name: 'delete_task',
      reason: 'readOnlyHint false'
    })
    expect(out.refused).toContainEqual({
      name: 'echo',
      reason: 'no readOnlyHint'
    })
  })

  it('tools accepts a JSON-RPC envelope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rc-'))
    const f = join(dir, 'e.json')
    writeFileSync(
      f,
      JSON.stringify({ result: JSON.parse(readFileSync(fixture, 'utf8')) })
    )
    const out = JSON.parse(run('tools', f).stdout)
    expect(out.readOnly.length).toBeGreaterThan(0)
  })

  it('tool exits 0 only for read-only tools', () => {
    expect(run('tool', fixture, 'list_tasks').status).toBe(0)
    const bad = run('tool', fixture, 'delete_task')
    expect(bad.status).toBe(1)
    expect(bad.stderr).toMatch(/not marked read-only/)
    expect(run('tool', fixture, 'echo').status).toBe(1)
    expect(run('tool', fixture, 'missing').status).toBe(1)
  })

  it('sanitize redacts secrets and emails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rc-'))
    const i = join(dir, 'in.json')
    const o = join(dir, 'out.json')
    writeFileSync(
      i,
      JSON.stringify({
        accessToken: 'abc',
        n: { Cookie: 'x', mail: 'a.b@corp.io' },
        ok: 1
      })
    )
    const r = run('sanitize', i, o)
    expect(r.stdout).toMatch(/3 replacements/)
    expect(JSON.parse(readFileSync(o, 'utf8'))).toEqual({
      accessToken: 'REDACTED',
      n: { Cookie: 'REDACTED', mail: 'user@example.com' },
      ok: 1
    })
  })

  it('id checks format and existing recipes', () => {
    expect(run('id', 'my-new-app').status).toBe(0)
    expect(run('id', 'Bad_Id').status).toBe(1)
    expect(run('id', 'example-tasks').status).toBe(1)
  })
})
