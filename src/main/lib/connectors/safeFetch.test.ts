import { readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createSafeFetch } from './safeFetch'

// DNS is injected (opts.resolve): fake names map onto the in-process
// servers on 127.0.0.1; "public" and link-local names must be refused
// before any request is made. The https → http test uses a committed
// self-signed certificate (fixtures/test-tls.*) for "secure.test", trusted
// only by wrapping https.request in that test.

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => void

interface Seen {
  method?: string
  url?: string
  host?: string
  auth?: string
  body: string
}

const SECRET = 'sekrit-token-value'

const NAMES: Record<string, string[]> = {
  'example.test': ['127.0.0.1'],
  'other.test': ['127.0.0.1'],
  'secure.test': ['127.0.0.1'],
  'public.test': ['93.184.216.34'],
  'meta.test': ['169.254.169.254'],
  'mapped.test': ['::ffff:169.254.169.254']
}

const resolve = async (host: string) => {
  const addrs = NAMES[host]
  if (!addrs) throw new Error(`ENOTFOUND ${host}`)
  return addrs
}

let server: http.Server
let port: number
let seen: Seen[]
let handler: Handler
const extra: { close(): Promise<void> }[] = []

function listen(s: http.Server): Promise<number> {
  return new Promise(done =>
    s.listen(0, '127.0.0.1', () => done((s.address() as AddressInfo).port))
  )
}

function close(s: http.Server): Promise<void> {
  s.closeAllConnections?.()
  return new Promise(done => s.close(() => done()))
}

beforeEach(async () => {
  seen = []
  handler = (_req, res) => res.end('ok')
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      seen.push({
        method: req.method,
        url: req.url,
        host: req.headers.host,
        auth: req.headers.authorization,
        body: Buffer.concat(chunks).toString('utf8')
      })
      handler(req, res)
    })
  })
  port = await listen(server)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await close(server)
  while (extra.length) await extra.pop()!.close()
})

const sf = (o: Parameters<typeof createSafeFetch>[0] = {}) =>
  createSafeFetch({ resolve, timeoutMs: 2000, ...o })

const at = (path: string, host = 'example.test') =>
  `http://${host}:${port}${path}`

async function failure(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(Error)
    return e
  }
  throw new Error('expected a failure')
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('safeFetch', () => {
  it('round-trips a GET', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ a: 1 }))
    }
    const res = await sf()(at('/get?x=1'))
    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ a: 1 })
    expect(res.url).toBe(at('/get?x=1'))
    expect(seen[0]).toMatchObject({
      method: 'GET',
      url: '/get?x=1',
      host: `example.test:${port}`
    })
  })

  it('round-trips a POST with a JSON body', async () => {
    handler = (req, res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          type: req.headers['content-type'],
          echo: JSON.parse(seen[0].body)
        })
      )
    }
    const res = await sf()(new URL(at('/post')), {
      method: 'POST',
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify({ hello: 'world' })
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      type: 'application/json',
      echo: { hello: 'world' }
    })
  })

  it('accepts a Request and URLSearchParams / Uint8Array bodies', async () => {
    handler = (req, res) =>
      res.end(`${req.headers['content-type']}|${seen.at(-1)!.body}`)
    const f = sf()
    const a = await f(
      new Request(at('/form'), {
        method: 'POST',
        body: new URLSearchParams({ code: 'x' })
      })
    )
    expect(await a.text()).toBe(
      'application/x-www-form-urlencoded;charset=UTF-8|code=x'
    )
    const b = await f(at('/bytes'), {
      method: 'PUT',
      body: new TextEncoder().encode('raw')
    })
    expect(await b.text()).toBe('undefined|raw')
  })

  it('rejects unsupported body types', async () => {
    const e = await failure(
      sf()(at('/x'), {
        method: 'POST',
        body: new Blob(['x']) as unknown as string
      })
    )
    expect(e).toBeInstanceOf(TypeError)
    expect(seen).toHaveLength(0)
  })

  it('streams SSE chunk by chunk', async () => {
    let sentSecond = false
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: one\n\n')
      setTimeout(() => {
        sentSecond = true
        res.end('data: two\n\n')
      }, 300)
    }
    const res = await sf()(at('/sse'))
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    const first = await reader.read()
    expect(dec.decode(first.value)).toBe('data: one\n\n')
    expect(sentSecond).toBe(false)
    let rest = ''
    for (;;) {
      const r = await reader.read()
      if (r.done) break
      rest += dec.decode(r.value)
    }
    expect(rest).toBe('data: two\n\n')
  })

  it('errors mid-stream past the byte cap', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      const chunk = Buffer.alloc(64 * 1024, 'a')
      let n = 0
      const write = (): void => {
        while (n < 40) {
          n++
          if (!res.write(chunk)) {
            res.once('drain', write)
            return
          }
        }
        res.end()
      }
      write()
    }
    const res = await sf()(at('/big'))
    expect(res.status).toBe(200)
    const e = await failure(res.arrayBuffer())
    expect(String(e)).toContain('Response too large')
  })

  it('refuses a Content-Length over the cap', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Length': '2000' })
      res.end('x'.repeat(2000))
    }
    const e = await failure(sf({ maxBytes: 1000 })(at('/len')))
    expect(String(e)).toContain('Response too large')
  })

  it('times out, including while streaming the body', async () => {
    handler = () => {}
    const e = await failure(sf({ timeoutMs: 150 })(at('/hang')))
    expect(String(e)).toContain('Timed out')

    let closed = false
    handler = (req, res) => {
      res.writeHead(200)
      res.write('start')
      req.socket.on('close', () => (closed = true))
    }
    const res = await sf({ timeoutMs: 200 })(at('/drip'))
    const e2 = await failure(res.text())
    expect(String(e2)).toContain('Timed out')
    await sleep(50)
    expect(closed).toBe(true)
  })

  it('honours a caller abort', async () => {
    handler = () => {}
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 100)
    const e = (await failure(
      sf()(at('/hang'), { signal: ac.signal })
    )) as Error
    expect(e.name).toBe('AbortError')

    handler = (_req, res) => {
      res.writeHead(200)
      res.write('start')
    }
    const ac2 = new AbortController()
    const res = await sf()(at('/drip'), { signal: ac2.signal })
    const reading = res.text()
    ac2.abort()
    const e2 = (await failure(reading)) as Error
    expect(e2.name).toBe('AbortError')

    const e3 = (await failure(
      sf()(at('/x'), { signal: AbortSignal.abort() })
    )) as Error
    expect(e3.name).toBe('AbortError')
  })

  it('307 keeps POST and its body; 303 becomes GET', async () => {
    handler = (req, res) => {
      if (req.url === '/307') {
        res.writeHead(307, { Location: '/target' })
        res.end()
      } else if (req.url === '/303') {
        res.writeHead(303, { Location: '/target' })
        res.end()
      } else res.end('done')
    }
    const f = sf()
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"k":1}'
    }
    const a = await f(at('/307'), init)
    expect(await a.text()).toBe('done')
    expect(a.redirected).toBe(true)
    expect(a.url).toBe(at('/target'))
    expect(seen[1]).toMatchObject({ method: 'POST', body: '{"k":1}' })

    seen = []
    await (await f(at('/303'), init)).text()
    expect(seen[1]).toMatchObject({ method: 'GET', body: '' })
  })

  it('returns the redirect unfollowed with redirect: manual', async () => {
    handler = (_req, res) => {
      res.writeHead(302, { Location: '/elsewhere' })
      res.end()
    }
    const res = await sf()(at('/r'), { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/elsewhere')
    expect(seen).toHaveLength(1)
  })

  it('drops Authorization cross-origin and keeps it same-origin', async () => {
    handler = (req, res) => {
      if (req.url === '/same') {
        res.writeHead(302, { Location: '/landed' })
        res.end()
      } else if (req.url === '/cross') {
        res.writeHead(302, { Location: at('/landed', 'other.test') })
        res.end()
      } else res.end('ok')
    }
    const headers = { Authorization: `Bearer ${SECRET}`, 'X-Key': SECRET }
    const f = sf({ sensitiveHeaders: ['X-Key'] })
    await (await f(at('/same'), { headers })).text()
    expect(seen.map(s => s.auth)).toEqual([
      `Bearer ${SECRET}`,
      `Bearer ${SECRET}`
    ])

    seen = []
    const xKeys: (string | undefined)[] = []
    const prevHandler = handler
    handler = (req, res) => {
      xKeys.push(req.headers['x-key'] as string | undefined)
      prevHandler(req, res)
    }
    await (await f(at('/cross'), { headers })).text()
    expect(seen.map(s => s.auth)).toEqual([`Bearer ${SECRET}`, undefined])
    expect(xKeys).toEqual([SECRET, undefined])
    expect(seen[1].host).toBe(`other.test:${port}`)
  })

  it('refuses redirects to link-local and IPv4-mapped link-local', async () => {
    for (const target of [
      'http://169.254.169.254/latest',
      `http://meta.test:${port}/x`,
      'http://[::ffff:169.254.169.254]/x',
      `http://mapped.test:${port}/x`
    ]) {
      seen = []
      handler = (_req, res) => {
        res.writeHead(302, { Location: target })
        res.end()
      }
      const e = await failure(sf()(at('/r')))
      expect(String(e)).toContain(
        'Link-local and reserved addresses are not allowed'
      )
      expect(seen).toHaveLength(1)
    }
  })

  it('refuses http to a public address without connecting', async () => {
    const e = await failure(sf()(at('/x', 'public.test')))
    expect(String(e)).toContain('Public hosts must use https')
    expect(seen).toHaveLength(0)
  })

  it('refuses an https → http redirect', async () => {
    const fixtures = join(__dirname, 'fixtures')
    const cert = readFileSync(join(fixtures, 'test-tls.crt'))
    const key = readFileSync(join(fixtures, 'test-tls.key'))
    const tls = https.createServer({ cert, key }, (_req, res) => {
      res.writeHead(302, { Location: at('/plain', 'example.test') })
      res.end()
    })
    const tlsPort = await listen(tls)
    extra.push({ close: () => close(tls) })
    const original = https.request
    vi.spyOn(https, 'request').mockImplementation(((
      options: https.RequestOptions,
      cb: (res: http.IncomingMessage) => void
    ) => original({ ...options, ca: cert }, cb)) as typeof https.request)

    const f = sf()
    const ok = await f(`https://secure.test:${tlsPort}/start`, {
      redirect: 'manual'
    })
    expect(ok.status).toBe(302)

    const e = await failure(f(`https://secure.test:${tlsPort}/start`))
    expect(String(e)).toContain('Redirect from https to http is not allowed')
    expect(seen).toHaveLength(0)
  })

  it('refuses more than 3 redirects', async () => {
    handler = (req, res) => {
      const n = Number(req.url!.slice(1))
      res.writeHead(302, { Location: `/${n + 1}` })
      res.end()
    }
    const e = await failure(sf()(at('/0')))
    expect(String(e)).toContain('Too many redirects')
    expect(seen).toHaveLength(4)
  })

  it('never puts the URL, host or secrets in error messages', async () => {
    const q = `?token=${SECRET}`
    const headers = { Authorization: `Bearer ${SECRET}` }
    const errors: unknown[] = []
    const f = sf({ timeoutMs: 150 })
    handler = (_req, res) => {
      res.writeHead(302, { Location: `http://meta.test/x${q}` })
      res.end()
    }
    errors.push(await failure(f(at(`/a${q}`), { headers })))
    errors.push(await failure(f(at(`/a${q}`, 'public.test'), { headers })))
    errors.push(await failure(f(at(`/a${q}`, 'nowhere.test'), { headers })))
    errors.push(await failure(f(`ftp://example.test/${q}`, { headers })))
    errors.push(
      await failure(f(at(`/a${q}`), { headers: { 'X-Bad': `a\nb${SECRET}` } }))
    )
    handler = () => {}
    errors.push(await failure(f(at(`/a${q}`), { headers })))
    await close(server)
    errors.push(await failure(f(at(`/a${q}`), { headers })))
    server = http.createServer()
    port = await listen(server)

    for (const e of errors) {
      const text = `${String(e)} ${(e as Error).stack ?? ''}`
      expect(text).not.toContain(SECRET)
      expect(text).not.toContain('example.test')
      expect(text).not.toContain('public.test')
      expect(text).not.toContain('nowhere.test')
      expect(text).not.toContain('meta.test')
      expect(text).not.toContain('127.0.0.1')
    }
  })

  it('works as the MCP SDK transport fetch', async () => {
    handler = (req, res) => {
      const mcp = new McpServer({ name: 'test', version: '1.0.0' })
      mcp.registerTool(
        'add',
        {
          description: 'Adds',
          inputSchema: { a: z.number(), b: z.number() },
          annotations: { readOnlyHint: true }
        },
        async ({ a, b }) => ({
          content: [{ type: 'text', text: String(a + b) }]
        })
      )
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      })
      res.on('close', () => {
        void transport.close()
        void mcp.close()
      })
      const body = seen.at(-1)!.body
      void mcp
        .connect(transport)
        .then(() =>
          transport.handleRequest(
            req,
            res,
            body ? JSON.parse(body) : undefined
          )
        )
    }

    const client = new Client({ name: 'glance', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(
      new URL(at('/mcp')),
      { fetch: sf() }
    )
    await client.connect(transport)
    const tools = await client.listTools()
    expect(tools.tools.map(t => t.name)).toEqual(['add'])
    const result = await client.callTool({
      name: 'add',
      arguments: { a: 2, b: 3 }
    })
    expect(result.content).toEqual([{ type: 'text', text: '5' }])
    await client.close()
  })
})
