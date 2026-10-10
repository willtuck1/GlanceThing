export const meta = {
  name: 'add-connector',
  description:
    'Turn an MCP server URL plus a saved tools/list and sample result into a committed recipe, fixtures, test, preview payload and screenshot',
  whenToUse:
    'Adding a new MCP connector recipe (M9C). Inputs are pasted or file-based; no agent ever logs in to or calls the MCP server.',
  phases: [
    { title: 'Inputs', detail: 'sanitize fixtures, list read-only tools', model: 'haiku' },
    { title: 'Design', detail: 'choose tool, layout and mapping', model: 'sonnet' },
    { title: 'Write', detail: 'recipe, test, preview payloads', model: 'sonnet' },
    { title: 'Screenshot', detail: 'shoot the tab at 800x480', model: 'haiku' },
    { title: 'Gate', detail: 'npm run gate -- fast', model: 'haiku' }
  ]
}

// Usage: Workflow({name: 'add-connector', args: {...}})
//   args = {
//     url: 'https://mcp.example.com/mcp',          // server URL (becomes defaultServerUrl)
//     goal: 'Show my open tasks due this week',
//     toolsList: {tools: [...]} | 'path/to/tools-list.json',  // saved tools/list result
//     sample: {...} | 'path/to/sample.json',                  // saved tool result or resource read
//     id?: 'my-tasks',                 // ^[a-z0-9-]{1,32}$, must be unused
//     tool?: 'list_tasks', resource?: 'app://tasks',
//     layout?: 'list', mapping?: {...}, toolArgs?: {...},
//     defaultUrl?: true, skipScreenshot?: false, skipGate?: false
//   }
// Inputs are saved by hand from a login you did yourself; the workflow never
// contacts the server. Review the sanitized fixtures before committing.

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const isInput = v => typeof v === 'string' ? v.length > 0 : isObj(v) || Array.isArray(v)

if (!isObj(args)) throw new Error('add-connector: args must be an object')
if (typeof args.url !== 'string' || !args.url) throw new Error('add-connector: args.url is required')
if (typeof args.goal !== 'string' || !args.goal) throw new Error('add-connector: args.goal is required')
if (!isInput(args.toolsList)) throw new Error('add-connector: args.toolsList is required (object or file path)')
if (!isInput(args.sample)) throw new Error('add-connector: args.sample is required (object or file path)')
if (args.id !== undefined && !/^[a-z0-9-]{1,32}$/.test(args.id))
  throw new Error('add-connector: args.id must match ^[a-z0-9-]{1,32}$')
if (args.tool && args.resource) throw new Error('add-connector: give tool or resource, not both')

const NO_NETWORK =
  'Do NOT log in to, connect to, or call any MCP server or network service; work only from the files named here.'

function toolsOf(doc) {
  if (Array.isArray(doc)) return doc
  if (isObj(doc)) {
    if (Array.isArray(doc.tools)) return doc.tools
    if (isObj(doc.result) && Array.isArray(doc.result.tools)) return doc.result.tools
  }
  return null
}

function readOnlyNames(tools) {
  return tools.filter(t => t && t.annotations && t.annotations.readOnlyHint === true).map(t => t.name)
}

function refuseTool(name) {
  return new Error('Tool "' + name + '" is not marked read-only (readOnlyHint !== true); refusing')
}

const toolsListIsObject = !(typeof args.toolsList === 'string')
if (toolsListIsObject) {
  const tools = toolsOf(args.toolsList)
  if (!tools) throw new Error('add-connector: toolsList must be {tools:[...]} or {result:{tools:[...]}}')
  const names = readOnlyNames(tools)
  if (args.tool && names.indexOf(args.tool) < 0) throw refuseTool(args.tool)
  if (!args.resource && !args.tool && names.length === 0)
    throw new Error('add-connector: no read-only tools in toolsList')
}

const given = !!((args.tool || args.resource) && args.layout && args.mapping)
const idHint = args.id || null

// ---------- Phase 1: Inputs ----------
phase('Inputs')
const INPUTS_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    toolsFile: { type: 'string' },
    sampleFile: { type: 'string' },
    sanitizeReplacements: { type: 'number' },
    tools: {
      type: 'object',
      properties: {
        readOnly: { type: 'array', items: { type: 'object' } },
        refused: { type: 'array', items: { type: 'object' } }
      },
      required: ['readOnly', 'refused']
    }
  },
  required: ['id', 'toolsFile', 'sampleFile', 'tools']
}

const toolsSrc = toolsListIsObject
  ? 'the JSON below (write it verbatim to a scratch file in the scratchpad directory first)\n' + JSON.stringify(args.toolsList)
  : 'the repo file ' + args.toolsList
const sampleSrc = typeof args.sample === 'string'
  ? 'the repo file ' + args.sample
  : 'the JSON below (write it verbatim to a scratch file in the scratchpad directory first)\n' + JSON.stringify(args.sample)

const inputs = await agent(
  [
    'Prepare inputs for a new MCP connector recipe. ' + NO_NETWORK,
    idHint
      ? 'Id: "' + idHint + '". Run `node scripts/mcp-recipe-check.mjs id ' + idHint + '`; if it exits non-zero return the error as the id field prefixed "ERROR:" and stop.'
      : 'No id was given: derive a short id (^[a-z0-9-]{1,32}$) from this goal: "' + args.goal + '", and confirm with `node scripts/mcp-recipe-check.mjs id <id>` (exit 0); try another if it exists.',
    'Create the directory src/main/lib/mcp/fixtures/recipes if missing. Then for tools list source ' + toolsSrc,
    '- run `node scripts/mcp-recipe-check.mjs sanitize <source> src/main/lib/mcp/fixtures/recipes/<id>.tools-list.json`.',
    'For sample source ' + sampleSrc,
    '- run `node scripts/mcp-recipe-check.mjs sanitize <source> src/main/lib/mcp/fixtures/recipes/<id>.sample.json`.',
    'Then run `node scripts/mcp-recipe-check.mjs tools src/main/lib/mcp/fixtures/recipes/<id>.tools-list.json` and return its JSON output unchanged as `tools`. Return the id, the two file paths, and the total replacement count. Do not edit anything else.'
  ].join('\n'),
  { label: 'Sanitize inputs', phase: 'Inputs', schema: INPUTS_SCHEMA, model: 'haiku' }
)
if (!inputs) throw new Error('add-connector: Inputs agent failed')
if (inputs.id.indexOf('ERROR:') === 0) throw new Error('add-connector: ' + inputs.id)
if (!/^[a-z0-9-]{1,32}$/.test(inputs.id)) throw new Error('add-connector: bad id from Inputs: ' + inputs.id)
const id = inputs.id
const readOnlyList = inputs.tools.readOnly
const roNames = readOnlyList.map(t => t.name)
if (!toolsListIsObject) {
  if (args.tool && roNames.indexOf(args.tool) < 0) throw refuseTool(args.tool)
  if (!args.resource && !args.tool && roNames.length === 0)
    throw new Error('add-connector: no read-only tools in toolsList')
}

// ---------- Phase 2: Design ----------
phase('Design')
let design
if (given) {
  design = {
    id,
    label: args.label || id,
    description: args.goal,
    tool: args.tool ? { name: args.tool, args: args.toolArgs || {} } : undefined,
    resource: args.resource ? { uri: args.resource } : undefined,
    layout: args.layout,
    mapping: args.mapping,
    settings: [],
    intervalMin: 15
  }
} else {
  const DESIGN_SCHEMA = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      label: { type: 'string' },
      description: { type: 'string' },
      tool: {
        type: 'object',
        properties: { name: { type: 'string' }, args: { type: 'object' } },
        required: ['name', 'args']
      },
      resource: {
        type: 'object',
        properties: { uri: { type: 'string' } },
        required: ['uri']
      },
      layout: { type: 'string', enum: ['list', 'number', 'keyvalue', 'grid'] },
      mapping: { type: 'object' },
      settings: { type: 'array', items: { type: 'object' } },
      intervalMin: { type: 'number' }
    },
    required: ['id', 'label', 'description', 'layout', 'mapping', 'settings', 'intervalMin']
  }
  design = await agent(
    [
      'Design an MCP connector recipe. ' + NO_NETWORK,
      'Goal: ' + args.goal,
      'Fixed by the user (keep these if present): tool=' + (args.tool || 'none') + ' resource=' + (args.resource || 'none') + ' layout=' + (args.layout || 'none') + ' mapping=' + (args.mapping ? JSON.stringify(args.mapping) : 'none') + ' toolArgs=' + (args.toolArgs ? JSON.stringify(args.toolArgs) : 'none'),
      'Read-only candidate tools (only these may be chosen):\n' + JSON.stringify(readOnlyList),
      'Sample result: read src/main/lib/mcp/fixtures/recipes/' + id + '.sample.json (already sanitized). Use result-shape knowledge from src/main/lib/mcp/result.ts (toolResultData / resourceResultData: text content is JSON-parsed, plain text becomes {text}).',
      'Read the recipe schema in src/main/lib/mcp/recipes.ts (parseRecipe) and the example src/main/lib/connectors/recipes/example-tasks.json, and the mapping shapes in src/main/lib/connectors/types.ts. Host-computed args use {"$host": ...}, user settings use {"$setting": key}.',
      'Return id "' + id + '", exactly one of tool {name,args} or resource {uri}, a layout, a mapping whose paths exist in the sample, settings (possibly empty), and intervalMin. Choose a tool only if it is read-only; prefer simple, no-argument calls.'
    ].join('\n'),
    { label: 'Design recipe', phase: 'Design', schema: DESIGN_SCHEMA, model: 'sonnet' }
  )
  if (!design) throw new Error('add-connector: Design agent failed')
  design.id = id
}
// Never trust the agent on read-only: re-check in plain JS.
if (!!design.tool === !!design.resource)
  throw new Error('add-connector: design must have exactly one of tool or resource')
if (design.tool && roNames.indexOf(design.tool.name) < 0) throw refuseTool(design.tool.name)

const recipe = {}
const keys = ['id', 'label', 'description', 'defaultServerUrl', 'intervalMin', 'tool', 'resource', 'settings', 'layout', 'mapping']
const withUrl = args.defaultUrl !== false
for (const k of keys) {
  if (k === 'defaultServerUrl') {
    if (withUrl) recipe.defaultServerUrl = args.url
  } else if (design[k] !== undefined) recipe[k] = design[k]
}

// ---------- Phase 3: Write ----------
phase('Write')
const previewId = (id.replace(/[^a-z0-9]/g, '') + '00000000').slice(0, 8)
const previewFile = 'scripts/preview/payloads/mcp-' + previewId + '.json'
const recipeFile = 'src/main/lib/connectors/recipes/' + id + '.json'
const testFile = 'src/main/lib/mcp/recipes/' + id + '.test.ts'
const tabsFile = 'scripts/preview/payloads/tabs.' + id + '.json'
const isTool = !!recipe.tool

const WRITE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    testOutputTail: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } }
  },
  required: ['ok', 'testOutputTail', 'files']
}

function writePrompt(failure) {
  return [
    'Write the files for MCP connector recipe "' + id + '". ' + NO_NETWORK,
    '1. ' + recipeFile + ' containing exactly this JSON (pretty-printed, 2 spaces, trailing newline):\n' + JSON.stringify(recipe, null, 2),
    '2. ' + testFile + ' (vitest, match src/main/lib/mcp/recipes.test.ts style). It must: parse the recipe file with parseRecipe from src/main/lib/mcp/recipes.ts; assert ' + (isTool ? 'the tool "' + recipe.tool.name + '"' : 'n/a (resource recipe; skip this assertion)') + ' has annotations.readOnlyHint === true in src/main/lib/mcp/fixtures/recipes/' + id + '.tools-list.json (accept {tools} or {result:{tools}}); run src/main/lib/mcp/fixtures/recipes/' + id + '.sample.json through ' + (isTool ? 'toolResultData' : 'resourceResultData') + ' from src/main/lib/mcp/result.ts and then applyMapping(layout, mapping, data) from src/main/lib/connectors/mapping.ts; assert a non-empty ConnectorView within LIMITS from src/main/lib/connectors/types.ts. When process.env.WRITE_PREVIEW === "1" it also writes ' + previewFile + ' as a FeedPayload envelope with the same keys as scripts/preview/payloads/mcp-exmp0001.json (items: [view], fetchedAt, fetchedAtLabel, stale false, error null).',
    '3. ' + tabsFile + ': copy scripts/preview/payloads/tabs.mcp.json but with the single connector {"id":"mcp:' + previewId + '","label":' + JSON.stringify(recipe.label) + ',"layout":"' + recipe.layout + '"} and order ending in "mcp:' + previewId + '".',
    'Then run `npx vitest run ' + testFile + ' src/main/lib/mcp/recipes.test.ts`, then once `WRITE_PREVIEW=1 npx vitest run ' + testFile + '` and confirm ' + previewFile + ' exists. Run `npx prettier --write` on the files you wrote, then `npx eslint ' + testFile + '` and `npx tsc --noEmit -p tsconfig.node.json`; both must be clean. The repo lint forbids `any` (@typescript-eslint/no-explicit-any): type values as `unknown` and narrow, or import the real types (Recipe, ConnectorView, Connector); never add eslint-disable comments.',
    failure ? 'A previous attempt failed with:\n' + failure + '\nFix the cause (do not weaken assertions).' : '',
    'Return ok (all tests pass, eslint and tsc are clean, and the preview file exists), the last ~30 lines of test output as testOutputTail, and the list of files written.'
  ].join('\n')
}

const escalations = []
let written = await agent(writePrompt(null), { label: 'Write recipe + test', phase: 'Write', schema: WRITE_SCHEMA, model: 'sonnet' })
if (!written || !written.ok) {
  const why1 = written ? written.testOutputTail : 'agent died'
  log('Escalation check: Write failed once on sonnet; retrying on sonnet')
  written = await agent(writePrompt(why1), { label: 'Write retry', phase: 'Write', schema: WRITE_SCHEMA, model: 'sonnet' })
  if (!written || !written.ok) {
    const why2 = written ? written.testOutputTail : 'agent died'
    escalations.push({ step: 'Write', from: 'sonnet', to: 'opus', why: 'failed twice: ' + String(why2).slice(-300) })
    log('ESCALATION: Write sonnet -> opus (failed twice)')
    written = await agent(writePrompt(why2), { label: 'Write escalated', phase: 'Write', schema: WRITE_SCHEMA, model: 'opus' })
  }
}
if (!written || !written.ok)
  throw new Error('add-connector: Write failed after escalation: ' + (written ? written.testOutputTail : 'agent died'))

// ---------- Phase 4: Screenshot ----------
phase('Screenshot')
let shot = null
if (!args.skipScreenshot) {
  const SHOT_SCHEMA = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, path: { type: 'string' }, note: { type: 'string' } },
    required: ['ok', 'path', 'note']
  }
  shot = await agent(
    [
      'Screenshot the new connector tab. ' + NO_NETWORK,
      'Follow scripts/preview/README.md: build the client if client/dist is missing (`npm --prefix client run build`), start `VARIANT_tabs=' + id + ' node scripts/preview/server.mjs &`, then shoot with scripts/preview/shoot.mjs into docs/connector-screenshots/ (create it) the tab "mcp:' + previewId + '" (last tab; press 2 from Weather the right number of times, tabs.' + id + '.json lists the order) and name the result ' + id + '.png. Note: the preview server reads ' + previewFile + ' for feed mcp:' + previewId + '. Afterwards stop the server with pkill -f "node scripts/preview/[s]erver".',
      'Return ok, the png path, and a one-line note (e.g. what the shot shows, or why it failed).'
    ].join('\n'),
    { label: 'Screenshot', phase: 'Screenshot', schema: SHOT_SCHEMA, model: 'haiku' }
  )
}

// ---------- Phase 5: Gate ----------
phase('Gate')
let gateTail = null
if (!args.skipGate) {
  const GATE_SCHEMA = {
    type: 'object',
    properties: { tail: { type: 'string' } },
    required: ['tail']
  }
  const g = await agent(
    'Run `npm run gate -- fast` in the repo root and return the verbatim output (last 40 lines at most) as `tail`. Do not fix anything. ' + NO_NETWORK,
    { label: 'Gate', phase: 'Gate', schema: GATE_SCHEMA, model: 'haiku' }
  )
  gateTail = g ? g.tail : null
}

const files = (written.files || []).concat([
  'src/main/lib/mcp/fixtures/recipes/' + id + '.tools-list.json',
  'src/main/lib/mcp/fixtures/recipes/' + id + '.sample.json'
])
if (shot && shot.ok) files.push(shot.path)

return {
  id,
  files,
  readOnlyTool: recipe.tool ? recipe.tool.name : null,
  escalations,
  gateTail,
  reminders: [
    'Review the sanitized fixtures by hand',
    'Update AGENTS.md if anything there became wrong',
    'Commit the recipe, fixtures, test, payloads and screenshot together'
  ]
}
