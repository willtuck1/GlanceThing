import {
  AGENT_LIMITS,
  AGENT_STATES,
  type AgentState,
  type AgentStatus
} from './types.js'

// C0, DEL, C1, line/paragraph separators, bidi controls, zero-width chars, BOM.
const STRIP_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

const SOURCE_RE = /^[a-z0-9-]{1,24}$/
const SESSION_ID_RE = /^[\x21-\x7e]+$/

/**
 * Cleans untrusted display text: strips control, bidi and zero-width chars,
 * collapses whitespace, trims and caps at `max` code points. Empty or
 * non-string → undefined.
 */
export function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  // Whitespace (incl. tab, newline, U+2028/2029) becomes a space first so
  // words stay apart; the remaining invisible chars are removed.
  const s = v
    .replace(/\s+/g, ' ')
    .replace(STRIP_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return undefined
  const capped = Array.from(s).slice(0, max).join('').trim()
  return capped || undefined
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** Strictly validates a posted status. Returns null on any problem; never throws. */
export function parseAgentStatus(v: unknown): AgentStatus | null {
  try {
    if (!isPlainObject(v)) return null
    // Read each property once (guards against getters returning different values).
    const source = v.source
    const sessionIdRaw = v.sessionId
    const state = v.state
    const label = v.label
    const detail = v.detail
    const end = v.end

    if (typeof source !== 'string' || !SOURCE_RE.test(source)) return null

    if (typeof sessionIdRaw !== 'string') return null
    const sessionId = sessionIdRaw.trim()
    if (
      sessionId.length < 1 ||
      sessionId.length > AGENT_LIMITS.sessionIdMax ||
      !SESSION_ID_RE.test(sessionId)
    )
      return null

    if (
      typeof state !== 'string' ||
      !(AGENT_STATES as readonly string[]).includes(state)
    )
      return null

    if (label !== undefined && typeof label !== 'string') return null
    if (detail !== undefined && typeof detail !== 'string') return null
    if (end !== undefined && typeof end !== 'boolean') return null

    const out: AgentStatus = {
      source,
      sessionId,
      state: end === true ? 'stopped' : (state as AgentState)
    }
    const l = cleanText(label, AGENT_LIMITS.labelMax)
    if (l !== undefined) out.label = l
    const d = cleanText(detail, AGENT_LIMITS.detailMax)
    if (d !== undefined) out.detail = d
    if (end !== undefined) out.end = end
    return out
  } catch {
    return null
  }
}
