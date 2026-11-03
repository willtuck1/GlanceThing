// Local HTTP ingest for agent status updates. Binds 127.0.0.1 only and
// accepts POST /v1/status (an AgentStatus) or POST /v1/hook/<adapterId> (a
// tool's raw hook payload, mapped by that adapter). Every request needs the
// bearer token. Browsers are refused (Origin / Sec-Fetch-Site), and the Host
// header must name the bound loopback port (DNS rebinding).
//
// Never logs the token, headers, bodies or labels. Responses are always
// empty, `Connection: close`, with no CORS headers.

import http from 'node:http'
import type { Socket } from 'node:net'

import { tokenMatches } from './token.js'
import {
  AGENT_LIMITS,
  type AgentAdapter,
  type AgentStatus
} from './types.js'
import { parseAgentStatus } from './validate.js'

const BIND_HOST = '127.0.0.1'
const ADAPTER_ID_RE = /^[a-z0-9-]{1,24}$/
const HOOK_PREFIX = '/v1/hook/'
// Grace period before destroying a socket we answered early, so the client
// can read the response before the connection is torn down.
const DESTROY_DELAY_MS = 50

export interface AgentsListenerOptions {
  port: number
  maxTries?: number
  host?: never
  token: () => string
  adapters: () => AgentAdapter[]
  onStatus: (status: AgentStatus, adapterId: string | null) => void
  timeoutMs?: number
}

export interface AgentsListener {
  port: number
  close: () => Promise<void>
}

function respond(
  res: http.ServerResponse,
  code: number,
  destroyAfter = false
): void {
  try {
    if (res.headersSent) {
      res.socket?.destroy()
      return
    }
    res.writeHead(code, {
      'Content-Length': '0',
      Connection: 'close',
      'Cache-Control': 'no-store'
    })
    if (destroyAfter) {
      res.once('finish', () => {
        const socket = res.socket
        if (!socket) return
        setTimeout(() => socket.destroy(), DESTROY_DELAY_MS).unref()
      })
    }
    res.end()
  } catch {
    res.socket?.destroy()
  }
}

type Route = { kind: 'status' } | { kind: 'hook'; adapter: AgentAdapter }

function route(
  req: http.IncomingMessage,
  adapters: () => AgentAdapter[]
): Route | null {
  if (req.method !== 'POST') return null
  const url = req.url ?? ''
  const q = url.indexOf('?')
  const path = q === -1 ? url : url.slice(0, q)
  if (path === '/v1/status') return { kind: 'status' }
  if (!path.startsWith(HOOK_PREFIX)) return null
  const id = path.slice(HOOK_PREFIX.length)
  if (!ADAPTER_ID_RE.test(id)) return null
  const adapter = adapters().find(a => a.id === id)
  return adapter ? { kind: 'hook', adapter } : null
}

function deliver(
  r: Route,
  body: unknown,
  onStatus: AgentsListenerOptions['onStatus']
): number {
  let status: AgentStatus | null
  let adapterId: string | null = null
  if (r.kind === 'status') {
    status = parseAgentStatus(body)
    if (!status) return 400
  } else {
    adapterId = r.adapter.id
    let mapped: AgentStatus | null
    try {
      mapped = r.adapter.toStatus(body)
    } catch {
      mapped = null
    }
    if (!mapped || typeof mapped !== 'object') return 202
    status = parseAgentStatus({ ...mapped, source: adapterId })
    if (!status) return 202
  }
  try {
    onStatus(status, adapterId)
  } catch {
    // The sender only needs to know the update was accepted.
  }
  return 202
}

function makeHandler(
  opts: AgentsListenerOptions,
  timeoutMs: number,
  boundPort: () => number
): http.RequestListener {
  return (req, res) => {
    try {
      const h = req.headers
      if (h.origin !== undefined) return respond(res, 400, true)
      const site = h['sec-fetch-site']
      if (site !== undefined && site !== 'none') {
        return respond(res, 400, true)
      }

      const port = boundPort()
      if (
        h.host !== `127.0.0.1:${port}` &&
        h.host !== `localhost:${port}`
      ) {
        return respond(res, 400, true)
      }

      let expected: string
      try {
        expected = opts.token()
      } catch {
        expected = ''
      }
      if (!expected || !tokenMatches(h.authorization, expected)) {
        return respond(res, 401, true)
      }

      const r = route(req, opts.adapters)
      if (!r) return respond(res, 404, true)

      const lengthHeader = h['content-length']
      if (lengthHeader !== undefined) {
        const n = Number(lengthHeader)
        if (!Number.isFinite(n) || n > AGENT_LIMITS.bodyMax) {
          return respond(res, 413, true)
        }
      }

      const type = h['content-type']
      if (
        typeof type !== 'string' ||
        !type.toLowerCase().startsWith('application/json')
      ) {
        return respond(res, 400, true)
      }

      let done = false
      let size = 0
      const chunks: Buffer[] = []
      const timer = setTimeout(() => {
        if (done) return
        done = true
        req.pause()
        respond(res, 400, true)
      }, timeoutMs)
      timer.unref()

      const finish = (code: number, destroyAfter: boolean): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        respond(res, code, destroyAfter)
      }

      req.on('data', (chunk: Buffer) => {
        if (done) return
        size += chunk.length
        if (size > AGENT_LIMITS.bodyMax) {
          req.pause()
          finish(413, true)
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (done) return
        let body: unknown
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          finish(400, false)
          return
        }
        finish(deliver(r, body, opts.onStatus), false)
      })
      req.on('error', () => {
        done = true
        clearTimeout(timer)
      })
      req.on('close', () => clearTimeout(timer))
    } catch {
      respond(res, 400, true)
    }
  }
}

function listenOnce(server: http.Server, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const onError = (): void => {
      server.off('listening', onListening)
      resolve(false)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve(true)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    try {
      server.listen(port, BIND_HOST)
    } catch {
      server.off('error', onError)
      server.off('listening', onListening)
      resolve(false)
    }
  })
}

export async function startAgentsListener(
  opts: AgentsListenerOptions
): Promise<AgentsListener> {
  const maxTries = Math.max(1, opts.maxTries ?? 10)
  const timeoutMs = opts.timeoutMs ?? 2000
  let boundPort = 0

  // connectionsCheckingInterval makes headersTimeout/requestTimeout fire
  // promptly instead of on Node's 30 s default check.
  const server = http.createServer(
    { connectionsCheckingInterval: 1000 },
    makeHandler(opts, timeoutMs, () => boundPort)
  )
  server.maxConnections = 32
  server.headersTimeout = timeoutMs
  server.requestTimeout = timeoutMs + 500
  server.maxHeadersCount = 50

  const sockets = new Set<Socket>()
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => sockets.delete(socket))
  })
  server.on('clientError', (_err, socket) => {
    socket.destroy()
  })

  for (let i = 0; i < maxTries; i++) {
    const port = opts.port === 0 ? 0 : opts.port + i
    if (await listenOnce(server, port)) {
      const addr = server.address()
      boundPort = typeof addr === 'object' && addr ? addr.port : port
      server.on('error', () => {})
      return {
        port: boundPort,
        close: () =>
          new Promise<void>(resolve => {
            for (const s of sockets) s.destroy()
            sockets.clear()
            server.close(() => resolve())
          })
      }
    }
  }
  throw new Error('Could not start the agents listener')
}
