import type { AgentAdapter, AgentState, AgentStatus } from '../types.js'
import { hookCommand } from '../snippets.js'
import { parseAgentStatus } from '../validate.js'

/**
 * Claude Code hooks adapter. `toStatus` is the privacy boundary: it reads only
 * `hook_event_name`, `session_id`, `cwd` (basename only), `tool_name` and
 * `notification_type`. Prompts, messages, titles, tool input/output, transcript
 * paths and everything else are never read. `detail` is a fixed phrase plus at
 * most a sanitized tool name.
 */

export const id = 'claude-code'
export const label = 'Claude'

const TOOL_MAX = 24

/** Last path segment of `cwd` (either separator); drive roots and empty → undefined. */
export function cwdBasename(cwd: unknown): string | undefined {
  if (typeof cwd !== 'string') return undefined
  const parts = cwd.split(/[/\\]/)
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  const last = parts[parts.length - 1]
  if (!last || /^[A-Za-z]:$/.test(last)) return undefined
  return last
}

/**
 * Tool name reduced to `[A-Za-z0-9_.-]`, ≤24 chars. MCP names
 * (`mcp__server__tool`) keep only the tool segment. Empty → undefined.
 */
export function sanitizeToolName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined
  let n = name
  if (n.startsWith('mcp__')) {
    const segs = n.split('__')
    n = segs[segs.length - 1]
  }
  const s = n.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, TOOL_MAX)
  return s || undefined
}

interface Mapped {
  state: AgentState
  detail: string
  end?: true
}

function mapNotification(type: unknown): Mapped | null {
  switch (type) {
    case 'permission_prompt':
      return { state: 'waiting', detail: 'Needs approval' }
    case 'elicitation_dialog':
    case 'elicitation_url_dialog':
    case 'agent_needs_input':
      return { state: 'waiting', detail: 'Waiting for you' }
    case 'idle_prompt':
      return { state: 'idle', detail: 'Waiting for you' }
    default:
      return null
  }
}

function mapEvent(
  p: Record<string, unknown>,
  event: unknown
): Mapped | null {
  switch (event) {
    case 'SessionStart':
      return { state: 'idle', detail: 'Ready' }
    case 'UserPromptSubmit':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'SubagentStop':
      return { state: 'working', detail: 'Working' }
    case 'PreToolUse': {
      const tool = sanitizeToolName(p.tool_name)
      return {
        state: 'working',
        detail: tool ? `Running ${tool}` : 'Working'
      }
    }
    case 'PermissionRequest': {
      const tool = sanitizeToolName(p.tool_name)
      return {
        state: 'waiting',
        detail: tool ? `Needs approval: ${tool}` : 'Needs approval'
      }
    }
    case 'Notification':
      return mapNotification(p.notification_type)
    case 'Stop':
      return { state: 'idle', detail: 'Done' }
    case 'StopFailure':
      return { state: 'idle', detail: 'Stopped with an error' }
    case 'SessionEnd':
      return { state: 'stopped', detail: 'Session ended', end: true }
    default:
      return null
  }
}

/** Maps a Claude Code hook payload to a validated status; null when unusable. Never throws. */
export function toStatus(payload: unknown): AgentStatus | null {
  try {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    )
      return null
    const p = payload as Record<string, unknown>
    const sessionId = p.session_id
    if (typeof sessionId !== 'string') return null
    const mapped = mapEvent(p, p.hook_event_name)
    if (!mapped) return null
    const candidate: Record<string, unknown> = {
      source: id,
      sessionId,
      state: mapped.state,
      detail: mapped.detail
    }
    if (mapped.end) candidate.end = true
    if (mapped.end !== true) {
      const name = cwdBasename(p.cwd)
      if (name !== undefined) candidate.label = name
    }
    return parseAgentStatus(candidate)
  } catch {
    return null
  }
}

/** Hook events `toStatus` maps. */
export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'SubagentStop',
  'Stop',
  'StopFailure',
  'SessionEnd'
] as const

/** `hooks` block for ~/.claude/settings.json. No matcher = all. timeout is seconds. */
export function configSnippet(port: number, token: string): string {
  const command = hookCommand(id, port, token)
  const hooks: Record<string, unknown> = {}
  for (const event of HOOK_EVENTS) {
    hooks[event] = [{ hooks: [{ type: 'command', command, timeout: 5 }] }]
  }
  return JSON.stringify({ hooks }, null, 2)
}

export const setupSteps: string[] = [
  'Open ~/.claude/settings.json (create it if missing).',
  'Merge the copied "hooks" block into it; keep any hooks you already have.',
  'Restart Claude Code. New sessions appear in the Agents tab.',
  'If you regenerate the token or the port changes, copy the config again.'
]

export const adapter: AgentAdapter = {
  id,
  label,
  toStatus,
  configSnippet,
  setupSteps
}
