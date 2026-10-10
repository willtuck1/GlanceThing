// Deterministic helper for MCP connector recipes. No dependencies.
//   node scripts/mcp-recipe-check.mjs tools <tools-list.json>
//   node scripts/mcp-recipe-check.mjs tool <tools-list.json> <name>
//   node scripts/mcp-recipe-check.mjs sanitize <in.json> <out.json>
//   node scripts/mcp-recipe-check.mjs id <id>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SECRET_KEY =
  /token|secret|password|authorization|api[_-]?key|cookie/i
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function extractTools(doc) {
  const tools = Array.isArray(doc)
    ? doc
    : (doc?.tools ?? doc?.result?.tools)
  if (!Array.isArray(tools))
    throw new Error('Expected {tools:[...]} or {result:{tools:[...]}}')
  return tools
}

export function classifyTools(tools) {
  const readOnly = []
  const refused = []
  for (const t of tools) {
    const hint = t?.annotations?.readOnlyHint
    if (hint === true) {
      readOnly.push({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema ?? {}
      })
    } else {
      refused.push({
        name: t?.name,
        reason: hint === false ? 'readOnlyHint false' : 'no readOnlyHint'
      })
    }
  }
  return { readOnly, refused }
}

export function sanitize(value) {
  let count = 0
  const walk = v => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out = {}
      for (const [k, x] of Object.entries(v)) {
        if (SECRET_KEY.test(k)) {
          out[k] = 'REDACTED'
          count++
        } else out[k] = walk(x)
      }
      return out
    }
    if (typeof v === 'string') {
      return v.replace(EMAIL, () => {
        count++
        return 'user@example.com'
      })
    }
    return v
  }
  const result = walk(value)
  return { result, count }
}

export function checkId(id) {
  if (!/^[a-z0-9-]{1,32}$/.test(id ?? ''))
    return 'Id must match ^[a-z0-9-]{1,32}$'
  if (
    existsSync(
      resolve(root, 'src/main/lib/connectors/recipes', id + '.json')
    )
  )
    return `Recipe "${id}" already exists`
  return null
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

function main(argv) {
  const [cmd, a, b] = argv
  try {
    if (cmd === 'tools' && a) {
      console.log(
        JSON.stringify(classifyTools(extractTools(readJson(a))), null, 2)
      )
    } else if (cmd === 'tool' && a && b) {
      const tool = extractTools(readJson(a)).find(t => t?.name === b)
      if (!tool) fail(`Tool "${b}" not found`)
      if (tool.annotations?.readOnlyHint !== true)
        fail(`Tool "${b}" is not marked read-only (readOnlyHint !== true)`)
      console.log(`Tool "${b}" is read-only`)
    } else if (cmd === 'sanitize' && a && b) {
      const { result, count } = sanitize(readJson(a))
      writeFileSync(b, JSON.stringify(result, null, 2) + '\n')
      console.log(`${count} replacements`)
    } else if (cmd === 'id' && a) {
      const err = checkId(a)
      if (err) fail(err)
      console.log(`Id "${a}" is free`)
    } else {
      fail(
        'Usage: mcp-recipe-check.mjs tools <file> | tool <file> <name> | sanitize <in> <out> | id <id>'
      )
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e))
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2))
