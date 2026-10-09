// Stand-in for the desktop host, for screenshots without Electron or a device.
// Serves client/dist and a websocket on :1337 that answers each feed request
// with <payloads>/<type>.json. Edit the JSON while it runs; it is reread on
// every request.
//
//   node scripts/preview/server.mjs [payloadDir]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const dist = path.join(root, 'client/dist')
const payloads = path.resolve(process.argv[2] ?? path.join(here, 'payloads'))
const version = JSON.parse(
  fs.readFileSync(path.join(root, 'client/package.json'), 'utf8')
).version

const BASE = '/usr/share/qt-superbird-app/webapp/'
const HTTP_PORT = 4180

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    const rel = url.startsWith(BASE) ? url.slice(BASE.length) : null
    // No password file: the client then skips auth, which this stub allows.
    const file = rel === '' ? 'index.html' : rel
    const full = file && path.join(dist, file)
    if (!full || !full.startsWith(dist) || !fs.existsSync(full)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(full)] ?? 'application/octet-stream'
    })
    fs.createReadStream(full).pipe(res)
  })
  .listen(HTTP_PORT)

function payload(type) {
  const file = path.join(payloads, `${type}.json`)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}

new WebSocketServer({ port: 1337 }).on('connection', ws => {
  ws.on('message', raw => {
    const { type, action } = JSON.parse(raw)
    if (type === 'ping') ws.send(JSON.stringify({ type: 'pong' }))
    else if (type === 'version')
      ws.send(JSON.stringify({ type: 'version', data: version }))
    else if (!action) {
      const data = payload(type)
      if (data) ws.send(JSON.stringify({ type, data }))
    }
  })
})

console.log(`preview: http://localhost:${HTTP_PORT}${BASE} payloads=${payloads}`)
