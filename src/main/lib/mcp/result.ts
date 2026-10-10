// Turns an MCP tool or resource result into plain data for the connector
// mapping (connectors/mapping.ts), which alone builds what the device sees.
// Pure; errors are McpRunError with short readable messages.

import { clean } from '../connectors/mapping.js'

import { McpRunError } from './guard.js'

const ERROR_CHARS = 200

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function texts(content: unknown): string[] {
  if (!Array.isArray(content)) return []
  return content
    .filter(
      (c): c is { type: 'text'; text: string } =>
        isObj(c) && c.type === 'text' && typeof c.text === 'string'
    )
    .map(c => c.text)
}

function parseOrText(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

export function toolResultData(result: unknown): unknown {
  const r = isObj(result) ? result : {}
  const parts = texts(r.content)
  if (r.isError === true) {
    const msg = parts.length ? clean(parts[0], ERROR_CHARS) : ''
    throw new McpRunError(msg ? `Server error: ${msg}` : 'Server error')
  }
  if (isObj(r.structuredContent)) return r.structuredContent
  if (!parts.length) throw new McpRunError('Empty result')
  return parseOrText(parts.join(''))
}

export function resourceResultData(result: unknown): unknown {
  const r = isObj(result) ? result : {}
  const first = Array.isArray(r.contents) ? r.contents[0] : undefined
  if (!isObj(first)) throw new McpRunError('Empty result')
  if (typeof first.text === 'string') return parseOrText(first.text)
  if ('blob' in first)
    throw new McpRunError('Binary resources are not supported')
  throw new McpRunError('Empty result')
}
