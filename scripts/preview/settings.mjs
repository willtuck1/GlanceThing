// Screenshots the desktop Settings -> Connectors panel (Electron renderer)
// in plain Chromium, with a stub `window.api` built from a state file.
//
//   node scripts/preview/settings.mjs <state> [<state> ...]
//
// <state> is scripts/preview/settings-states/<state>.json:
//   connectors   listConnectors() result
//   mcpRecipes   listMcpRecipes() result
//   css          optional CSS added to the page (e.g. a taller Settings box)
//   signInError  if set, mcpSignIn() resolves {error}
//   api          optional {method: returnValue} overrides for any other call
//   clicks       after opening Settings -> Connectors: strings click the first
//                button whose name contains the text; {select: value} picks
//                an option in the first <select>
// Every other window.api method resolves null (on() returns a no-op
// unsubscribe), so add an `api` override if the page needs more.
// Output: docs/m9c-screenshots/settings-<state>.png. Never put real
// secrets in a state file.
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = path.join(root, 'docs/m9c-screenshots')
const distDir = path.join(root, 'out/renderer')

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim()
    return createRequire(path.join(globalRoot, 'x'))('playwright')
  }
}

const states = process.argv.slice(2)
if (states.length === 0) {
  console.error('usage: settings.mjs <state> [<state> ...]')
  process.exit(1)
}

// The renderer is built into out/renderer (main and preload build too).
execSync('npx electron-vite build', { cwd: root, stdio: 'ignore' })

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
  const file = path.join(distDir, rel === '/' ? 'index.html' : rel)
  if (!file.startsWith(distDir) || !fs.existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, {
    'content-type': types[path.extname(file)] ?? 'application/octet-stream'
  })
  fs.createReadStream(file).pipe(res)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/`

// Runs in the page before any script. `state` is the parsed state file.
function installStub(state) {
  const overrides = state.api ?? {}
  const base = {
    listConnectors: state.connectors ?? [],
    listMcpRecipes: state.mcpRecipes ?? [],
    getVersion: '0.0.0-preview',
    getChannel: 'stable',
    isDevMode: false,
    findCarThing: false,
    getServerInfo: { running: false, port: null },
    getShortcuts: [],
    getGoogleStatus: {
      configured: false,
      clientSource: null,
      clientId: '',
      connected: false,
      setupGuideUrl: ''
    },
    mcpSignOut: true
  }
  const values = { ...base, ...overrides }
  window.api = new Proxy(
    {},
    {
      get(_t, name) {
        if (name === 'on') return () => () => {}
        if (name === 'mcpSignIn')
          return async () =>
            state.signInError ? { error: state.signInError } : { ok: true }
        if (name in values) return async () => values[name]
        return async () => null
      }
    }
  )
  window.electron = { ipcRenderer: { on() {}, send() {}, invoke: async () => null } }
}

const { chromium } = await loadPlaywright()
const browser = await chromium.launch()
fs.mkdirSync(outDir, { recursive: true })
let failed = false
try {
  for (const name of states) {
    const file = path.join(root, 'scripts/preview/settings-states', `${name}.json`)
    const state = JSON.parse(fs.readFileSync(file, 'utf-8'))
    // 900 wide like the BrowserWindow in src/main/index.ts; 30 px taller for tall states.
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    page.on('pageerror', e => console.error(`${name}: page error: ${e.message}`))
    await page.addInitScript(installStub, state)
    await page.goto(url)
    if (state.css) await page.addStyleTag({ content: state.css })
    const press = text =>
      page.getByRole('button', { name: text }).first().click()
    await press('settings')
    await press('Connectors')
    for (const c of state.clicks ?? []) {
      if (typeof c === 'string') await press(c)
      else if (c.select) await page.locator('select').first().selectOption(c.select)
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(500)
    const out = path.join(outDir, `settings-${name}.png`)
    await page.screenshot({ path: out })
    console.log(out)
    await page.close()
  }
} catch (e) {
  console.error(e)
  failed = true
} finally {
  await browser.close()
  server.close()
}
if (failed) process.exit(1)
