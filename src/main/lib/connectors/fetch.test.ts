import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConnectorFetchError } from './address'
import { fetchConnectorJson, type HopRequest } from './fetch'

// DNS is always injected. Fake names map onto the in-process server on
// 127.0.0.1; "public" and link-local names must be refused before any
// request is made.
//
// Real https has no test certificate, so the https → http redirect test
// injects the hop request (deps.request).

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => void

interface Seen {
  host?: string
  url?: string
  secret?: string
}

let server: http.Server
let port: number
let seen: Seen[]
let handler: Handler

const NAMES: Record<string, string[]> = {
  'example.test': ['127.0.0.1'],
  'other.test': ['127.0.0.1'],
  'public.test': ['93.184.216.34'],
  'meta.test': ['169.254.169.254']
}

const resolve = async (host: string) => {
  const addrs = NAMES[host]
  if (!addrs) throw new Error(`ENOTFOUND ${host}`)
  return addrs
}

const fetchIt = (
  url: string,
  extra: {
    header?: { name: string; value: string }
    timeoutMs?: number
    maxBytes?: number
  } = {}
) =>
  fetchConnectorJson(url, {
    header: extra.header,
    deps: {
      resolve,
      timeoutMs: extra.timeoutMs ?? 2000,
      maxBytes: extra.maxBytes
    }
  })

const json = (
  res: http.ServerResponse,
  body: unknown,
  type = 'application/json'
) => {
  res.writeHead(200, { 'Content-Type': type })
  res.end(JSON.stringify(body))
}

async function failure(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(ConnectorFetchError)
    return (e as Error).message
  }
  throw new Error('expected a failure')
}

beforeEach(async () => {
  seen = []
  handler = (_req, res) => json(res, { ok: true })
  server = http.createServer((req, res) => {
    seen.push({
      host: req.headers.host,
      url: req.url,
      secret: req.headers['x-secret'] as string | undefined
    })
    handler(req, res)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>(r => server.close(() => r()))
})

describe('fetchConnectorJson', () => {
  it('fetches JSON over http from a name resolving to a local address', async () => {
    handler = (req, res) => {
      expect(req.headers.accept).toBe('application/json')
      expect(req.headers['accept-encoding']).toBe('identity')
      expect(req.headers['user-agent']).toBe('GlanceThing')
      json(res, { items: [1, 2] }, 'application/json; charset=utf-8')
    }
    await expect(
      fetchIt(`http://example.test:${port}/data?x=1`)
    ).resolves.toEqual({
      items: [1, 2]
    })
    expect(seen).toEqual([
      { host: `example.test:${port}`, url: '/data?x=1', secret: undefined }
    ])
  })

  it('accepts +json content types', async () => {
    handler = (_req, res) => json(res, [1], 'application/vnd.api+json')
    await expect(fetchIt(`http://example.test:${port}/`)).resolves.toEqual(
      [1]
    )
  })

  it('refuses http to a name resolving to a public address without connecting', async () => {
    expect(await failure(fetchIt(`http://public.test:${port}/`))).toBe(
      'Public hosts must use https'
    )
    expect(seen).toHaveLength(0)
  })

  it('refuses a name resolving to link-local', async () => {
    expect(await failure(fetchIt(`https://meta.test/latest`))).toBe(
      'Link-local and reserved addresses are not allowed'
    )
  })

  it('reports unresolvable hosts', async () => {
    expect(await failure(fetchIt(`https://nowhere.test/`))).toBe(
      'Could not resolve host'
    )
  })

  it('refuses unsupported schemes', async () => {
    expect(await failure(fetchIt('file:///etc/passwd'))).toBe(
      'Unsupported URL scheme'
    )
  })

  it('follows redirects and re-checks each hop', async () => {
    handler = (req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { Location: '/next' })
        res.end()
      } else if (req.url === '/next') {
        res.writeHead(301, { Location: `http://other.test:${port}/final` })
        res.end()
      } else json(res, { done: true })
    }
    await expect(
      fetchIt(`http://example.test:${port}/start`)
    ).resolves.toEqual({
      done: true
    })
    expect(seen.map(s => s.url)).toEqual(['/start', '/next', '/final'])
  })

  it('refuses a redirect to a link-local address', async () => {
    handler = (_req, res) => {
      res.writeHead(302, {
        Location: 'https://meta.test/latest/meta-data'
      })
      res.end()
    }
    expect(await failure(fetchIt(`http://example.test:${port}/`))).toBe(
      'Link-local and reserved addresses are not allowed'
    )
    expect(seen).toHaveLength(1)
  })

  it('refuses a redirect to a public host over http', async () => {
    handler = (_req, res) => {
      res.writeHead(307, { Location: `http://public.test:${port}/` })
      res.end()
    }
    expect(await failure(fetchIt(`http://example.test:${port}/`))).toBe(
      'Public hosts must use https'
    )
    expect(seen).toHaveLength(1)
  })

  it('stops after 3 redirects', async () => {
    handler = (req, res) => {
      const n = Number(req.url?.slice(1)) || 0
      res.writeHead(302, { Location: `/${n + 1}` })
      res.end()
    }
    expect(await failure(fetchIt(`http://example.test:${port}/0`))).toBe(
      'Too many redirects'
    )
    expect(seen).toHaveLength(4)
  })

  it('sends the secret header only to the original origin', async () => {
    handler = (req, res) => {
      if (req.url === '/a') {
        res.writeHead(302, { Location: '/b' })
        res.end()
      } else if (req.url === '/b') {
        res.writeHead(302, { Location: `http://other.test:${port}/c` })
        res.end()
      } else if (req.url === '/c') {
        res.writeHead(302, { Location: `http://example.test:${port}/d` })
        res.end()
      } else json(res, {})
    }
    await fetchIt(`http://example.test:${port}/a`, {
      header: { name: 'X-Secret', value: 'abc' }
    })
    expect(seen.map(s => [s.url, s.secret])).toEqual([
      ['/a', 'abc'],
      ['/b', 'abc'],
      ['/c', undefined],
      ['/d', 'abc']
    ])
  })

  it('refuses a Content-Length over the cap', async () => {
    handler = (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': '500'
      })
      res.end(JSON.stringify({ s: 'x'.repeat(490) }))
    }
    expect(
      await failure(
        fetchIt(`http://example.test:${port}/`, { maxBytes: 100 })
      )
    ).toBe('Response too large')
  })

  it('refuses a chunked body over the cap', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{"s":"')
      for (let i = 0; i < 10; i++) res.write('x'.repeat(50))
      res.end('"}')
    }
    expect(
      await failure(
        fetchIt(`http://example.test:${port}/`, { maxBytes: 100 })
      )
    ).toBe('Response too large')
  })

  it('times out when the server never responds', async () => {
    handler = () => {}
    expect(
      await failure(
        fetchIt(`http://example.test:${port}/`, { timeoutMs: 200 })
      )
    ).toBe('Timed out')
  })

  it('times out on a body that drips forever', async () => {
    const timers: ReturnType<typeof setInterval>[] = []
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('[')
      timers.push(setInterval(() => res.write(' '), 50))
      res.on('close', () => timers.forEach(clearInterval))
    }
    try {
      expect(
        await failure(
          fetchIt(`http://example.test:${port}/`, { timeoutMs: 300 })
        )
      ).toBe('Timed out')
    } finally {
      timers.forEach(clearInterval)
    }
  })

  it('refuses an https → http redirect before a second request', async () => {
    const calls: string[] = []
    const request: HopRequest = async url => {
      calls.push(url.href)
      return { redirect: new URL('http://example.test/data') }
    }
    const message = await failure(
      fetchConnectorJson('https://public.test/start', {
        deps: { resolve, request, timeoutMs: 2000 }
      })
    )
    expect(message).toBe('Redirect from https to http is not allowed')
    expect(calls).toEqual(['https://public.test/start'])
  })

  it('refuses non-JSON content types', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html></html>')
    }
    expect(await failure(fetchIt(`http://example.test:${port}/`))).toBe(
      'Response is not JSON'
    )
  })

  it('refuses invalid JSON', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{nope')
    }
    expect(await failure(fetchIt(`http://example.test:${port}/`))).toBe(
      'Response is not valid JSON'
    )
  })

  it('reports HTTP errors by status only', async () => {
    handler = (_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end('{}')
    }
    expect(await failure(fetchIt(`http://example.test:${port}/`))).toBe(
      'HTTP 500'
    )
  })

  it('reports connection refused', async () => {
    const closed = http.createServer()
    await new Promise<void>(r => closed.listen(0, '127.0.0.1', r))
    const deadPort = (closed.address() as AddressInfo).port
    await new Promise<void>(r => closed.close(() => r()))
    expect(
      await failure(fetchIt(`http://example.test:${deadPort}/`))
    ).toBe('Connection refused')
  })

  it('never puts the URL, query or secret in error messages', async () => {
    const header = { name: 'X-Secret', value: 'SECRET456' }
    const paths: Handler[] = [
      (_req, res) => {
        res.writeHead(500)
        res.end('SECRET123 SECRET456')
      },
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('x')
      },
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('SECRET456')
      },
      (_req, res) => {
        res.writeHead(302, {
          Location: `http://public.test:${port}/p?token=SECRET123`
        })
        res.end()
      },
      () => {}
    ]
    for (const h of paths) {
      handler = h
      const message = await failure(
        fetchIt(
          `http://example.test:${port}/private/path?token=SECRET123`,
          {
            header,
            timeoutMs: 200
          }
        )
      )
      expect(message).not.toMatch(
        /SECRET123|SECRET456|private|example\.test|token/
      )
    }
    const bad = await failure(
      fetchConnectorJson('http://example.test/?token=SECRET123', {
        header: { name: 'X-Secret', value: 'bad\nSECRET456' },
        deps: { resolve }
      })
    )
    expect(bad).not.toMatch(/SECRET123|SECRET456|example\.test/)
  })
})
