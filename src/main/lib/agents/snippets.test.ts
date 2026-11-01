import { describe, expect, it } from 'vitest'
import { customCurl, customExampleBody, hookCommand } from './snippets.js'
import { parseAgentStatus } from './validate.js'

const token = 'ab'.repeat(32)

describe('snippets', () => {
  it('hookCommand matches the spec', () => {
    expect(hookCommand('claude-code', 47816, token)).toBe(
      `curl -s -m 2 -X POST http://127.0.0.1:47816/v1/hook/claude-code -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" --data-binary @- || true`
    )
  })

  it('customCurl posts a valid body to /v1/status', () => {
    const cmd = customCurl(47816, token)
    expect(cmd).toContain('/v1/status')
    expect(cmd).toContain('source')
    const m = cmd.match(/-d "(.*)"$/)
    expect(m).not.toBeNull()
    const body = JSON.parse(m![1].replace(/\\"/g, '"'))
    expect(body).toEqual(customExampleBody)
    expect(body.source).toBe('custom')
    expect(parseAgentStatus(body)).not.toBeNull()
  })

  it('rejects invalid inputs', () => {
    expect(() => hookCommand('claude-code', 0, token)).toThrow()
    expect(() => hookCommand('claude-code', 70000, token)).toThrow()
    expect(() => hookCommand('claude-code', 1.5, token)).toThrow()
    expect(() => hookCommand('claude-code', 1, 'short')).toThrow()
    expect(() => hookCommand('Bad Id', 1, token)).toThrow()
    expect(() => hookCommand('', 1, token)).toThrow()
    expect(() => customCurl(0, token)).toThrow()
    expect(() => customCurl(1, 'x')).toThrow()
  })
})
