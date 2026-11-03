import http from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi
} from 'vitest'

vi.mock('../storage.js', () => ({
  getStorageValue: () => null,
  setStorageValue: () => {}
}))

import { startAgentsListener, type AgentsListener } from './listener.js'
import type { AgentAdapter, AgentStatus } from './types.js'

const TOKEN = 'a'.repeat(64)
const AUTH = `Bearer ${TOKEN}`

const fake: AgentAdapter = {
  id: 'fake',
  label: 'Fake',
  toStatus(p: unknown): AgentStatus | null {
    const o = p as Record<string, unknown>
    if (o?.boom) throw new Error('boom')
    if (o?.ok === true) {
      return { source: 'other', sessionId: 's1', state: 'waiting' }
    }
    return null
  },
  configSnippet: () => '',
  setupSteps: []
}

interface Result {
  status: number | null
  headers: http.IncomingHttpHeaders
  closed: boolean
}

let listener: AgentsListener
let onStatus: Mock<(status: AgentStatus, adapterId: string | null) => void>

async function start(timeoutMs?: number): Promise<void> {
  listener = await startAgentsListener({
    port: 0,
    token: () => TOKEN,
    adapters: () => [fake],
    onStatus,
    timeoutMs
  })
}

function request(opts: {
  method?: string
  path?: string
  headers?: Record<string, string>
  body?: string | Buffer
  chunks?: Buffer[]
  noEnd?: boolean
}): Promise<Result> {
  return new Promise(resolve => {
    const headers: Record<string, string> = {
      Host: `127.0.0.1:${listener.port}`,
      Authorization: AUTH,
      'Content-Type': 'application/json',
      ...opts.headers
    }
    for (const k of Object.keys(headers)) {
      if (headers[k] === '') delete headers[k]
    }
    const req = http.request({
      host: '127.0.0.1',
      port: listener.port,
      method: opts.method ?? 'POST',
      path: opts.path ?? '/v1/status',
      headers,
      agent: false,
      setHost: false
    })
    let result: Result | null = null
    req.on('response', res => {
      result = {
        status: res.statusCode ?? null,
        headers: res.headers,
        closed: false
      }
      res.resume()
      res.on('end', () => resolve(result!))
      res.on('error', () => resolve(result!))
    })
    req.on('error', () => {
      resolve(result ?? { status: null, headers: {}, closed: true })
    })
    req.on('close', () => {
      if (!result) resolve({ status: null, headers: {}, closed: true })
    })
    if (opts.chunks) for (const c of opts.chunks) req.write(c)
    if (opts.body !== undefined) req.write(opts.body)
    if (!opts.noEnd) req.end()
    else req.flushHeaders()
  })
}

const valid = JSON.stringify({
  source: 'custom',
  sessionId: 'abc',
  state: 'working',
  label: 'Repo'
})

beforeEach(async () => {
  onStatus = vi.fn()
  await start()
})

afterEach(async () => {
  await listener.close()
})

describe('startAgentsListener', () => {
  it('binds 127.0.0.1 on an ephemeral port', async () => {
    expect(listener.port).toBeGreaterThan(0)
    const res = await request({ body: valid })
    expect(res.status).toBe(202)
  })

  it('reports 127.0.0.1 as the server address', async () => {
    const spy = vi.spyOn(http, 'createServer')
    try {
      const l = await startAgentsListener({
        port: 0,
        token: () => TOKEN,
        adapters: () => [],
        onStatus
      })
      const server = spy.mock.results[0].value as http.Server
      const addr = server.address() as AddressInfo
      expect(addr.address).toBe('127.0.0.1')
      expect(addr.port).toBe(l.port)
      await l.close()
    } finally {
      spy.mockRestore()
    }
  })

  it('400 with an Origin header, without calling onStatus', async () => {
    const res = await request({
      headers: { Origin: 'http://evil.example' },
      body: valid
    })
    expect(res.status).toBe(400)
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('400 with Sec-Fetch-Site other than none', async () => {
    const res = await request({
      headers: { 'Sec-Fetch-Site': 'cross-site' },
      body: valid
    })
    expect(res.status).toBe(400)
    const ok = await request({
      headers: { 'Sec-Fetch-Site': 'none' },
      body: valid
    })
    expect(ok.status).toBe(202)
  })

  it('400 with a wrong Host, accepts localhost:<port>', async () => {
    expect(
      (await request({ headers: { Host: 'evil.example' }, body: valid }))
        .status
    ).toBe(400)
    expect(
      (
        await request({
          headers: { Host: `127.0.0.1:${listener.port + 1}` },
          body: valid
        })
      ).status
    ).toBe(400)
    expect(
      (
        await request({
          headers: { Host: `localhost:${listener.port}` },
          body: valid
        })
      ).status
    ).toBe(202)
  })

  it('401 for missing or wrong token, also on unknown routes', async () => {
    expect(
      (await request({ headers: { Authorization: '' }, body: valid }))
        .status
    ).toBe(401)
    expect(
      (
        await request({
          headers: { Authorization: `Bearer ${'b'.repeat(64)}` },
          body: valid
        })
      ).status
    ).toBe(401)
    expect(
      (
        await request({
          path: '/nope',
          headers: { Authorization: '' },
          body: valid
        })
      ).status
    ).toBe(401)
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('404 for unknown route, unknown adapter, bad id and wrong method', async () => {
    expect((await request({ path: '/nope', body: valid })).status).toBe(
      404
    )
    expect(
      (await request({ path: '/v1/hook/missing', body: '{"ok":true}' }))
        .status
    ).toBe(404)
    expect(
      (await request({ path: '/v1/hook/Fake', body: '{"ok":true}' }))
        .status
    ).toBe(404)
    expect(
      (await request({ path: '/v1/status/', body: valid })).status
    ).toBe(404)
    expect(
      (await request({ method: 'GET', path: '/v1/status' })).status
    ).toBe(404)
  })

  it('ignores the query string', async () => {
    expect(
      (await request({ path: '/v1/status?x=1', body: valid })).status
    ).toBe(202)
  })

  it('413 for Content-Length over the cap', async () => {
    const res = await request({
      headers: { 'Content-Length': '70000' },
      noEnd: true
    })
    expect(res.status).toBe(413)
  })

  it('413 for a chunked body over the cap', async () => {
    const chunk = Buffer.alloc(16384, 0x20)
    const res = await request({
      chunks: [chunk, chunk, chunk, chunk, chunk]
    })
    expect(res.status).toBe(413)
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('400 for bad JSON, wrong content-type and invalid AgentStatus', async () => {
    expect((await request({ body: '{nope' })).status).toBe(400)
    // Hooks always send application/json; anything else is refused.
    expect(
      (
        await request({
          headers: { 'Content-Type': 'text/plain' },
          body: valid
        })
      ).status
    ).toBe(400)
    expect(
      (
        await request({
          body: JSON.stringify({
            source: 'BAD',
            sessionId: 'x',
            state: 'working'
          })
        })
      ).status
    ).toBe(400)
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('202 and onStatus with the parsed status', async () => {
    const res = await request({
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: valid
    })
    expect(res.status).toBe(202)
    expect(onStatus).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith(
      {
        source: 'custom',
        sessionId: 'abc',
        state: 'working',
        label: 'Repo'
      },
      null
    )
  })

  it('hook route forces source to the adapter id', async () => {
    const res = await request({
      path: '/v1/hook/fake',
      body: '{"ok":true}'
    })
    expect(res.status).toBe(202)
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'fake',
        sessionId: 's1',
        state: 'waiting'
      }),
      'fake'
    )
  })

  it('hook returning null or throwing → 202 without a call', async () => {
    expect(
      (await request({ path: '/v1/hook/fake', body: '{"ok":false}' }))
        .status
    ).toBe(202)
    expect(
      (await request({ path: '/v1/hook/fake', body: '{"boom":true}' }))
        .status
    ).toBe(202)
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('still 202 when onStatus throws', async () => {
    onStatus.mockImplementation(() => {
      throw new Error('x')
    })
    expect((await request({ body: valid })).status).toBe(202)
  })

  it('response headers: empty, close, no-store, no CORS', async () => {
    for (const r of [
      await request({ body: valid }),
      await request({ headers: { Origin: 'http://x' }, body: valid }),
      await request({ headers: { Authorization: '' }, body: valid })
    ]) {
      expect(r.headers['content-length']).toBe('0')
      expect(r.headers.connection).toBe('close')
      expect(r.headers['cache-control']).toBe('no-store')
      expect(
        Object.keys(r.headers).some(k => k.startsWith('access-control-'))
      ).toBe(false)
    }
  })

  it('closes a slow body after timeoutMs', async () => {
    await listener.close()
    await start(200)
    const t0 = Date.now()
    const res = await request({
      headers: { 'Content-Length': '100' },
      body: '{"source"',
      noEnd: true
    })
    const elapsed = Date.now() - t0
    expect(res.status === 400 || res.closed).toBe(true)
    expect(elapsed).toBeGreaterThanOrEqual(150)
    expect(elapsed).toBeLessThan(1500)
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('binds the next port when the first is taken', async () => {
    const blocker = http.createServer()
    await new Promise<void>(r => blocker.listen(0, '127.0.0.1', () => r()))
    const taken = (blocker.address() as AddressInfo).port
    try {
      const l = await startAgentsListener({
        port: taken,
        maxTries: 3,
        token: () => TOKEN,
        adapters: () => [],
        onStatus
      })
      expect(l.port).toBeGreaterThan(taken)
      expect(l.port).toBeLessThanOrEqual(taken + 2)
      await expect(l.close()).resolves.toBeUndefined()
    } finally {
      await new Promise<void>(r => blocker.close(() => r()))
    }
  })

  it('rejects with a plain error when every try fails', async () => {
    const blocker = http.createServer()
    await new Promise<void>(r => blocker.listen(0, '127.0.0.1', () => r()))
    const taken = (blocker.address() as AddressInfo).port
    try {
      await expect(
        startAgentsListener({
          port: taken,
          maxTries: 1,
          token: () => TOKEN,
          adapters: () => [],
          onStatus
        })
      ).rejects.toThrow('Could not start the agents listener')
    } finally {
      await new Promise<void>(r => blocker.close(() => r()))
    }
  })
})
