// One-shot OAuth redirect receiver on 127.0.0.1 (RFC 8252 loopback). The
// first GET /callback is consumed and the server closes; the page it serves is
// static and never echoes the request. Nothing here logs.

import { timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'

export interface Loopback {
  redirectUrl: string
  waitForCallback(expectedState: string): Promise<string>
  close(): void
}

type Outcome =
  | {
      kind: 'params'
      state: string | null
      code: string | null
      error: boolean
    }
  | { kind: 'failed'; message: string }

const PAGE =
  '<!doctype html><meta charset="utf-8"><title>GlanceThing</title>' +
  '<p style="font-family:sans-serif">Sign-in finished. You can close this ' +
  'window and return to GlanceThing.</p>'

function stateMatches(expected: string, got: string | null): boolean {
  if (got === null) return false
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(got, 'utf8')
  // Compare equal-length buffers so the length check leaks nothing extra.
  const same = timingSafeEqual(
    a,
    b.length === a.length ? b : Buffer.alloc(a.length)
  )
  return same && b.length === a.length
}

export async function startLoopback({
  timeoutMs = 300_000
}: { timeoutMs?: number } = {}): Promise<Loopback> {
  let settle!: (o: Outcome) => void
  let settled = false
  const outcome = new Promise<Outcome>(resolve => {
    settle = o => {
      if (settled) return
      settled = true
      resolve(o)
    }
  })
  let closed = false

  const server = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      let path = ''
      let params: URLSearchParams | null = null
      try {
        const u = new URL(req.url ?? '/', 'http://127.0.0.1')
        path = u.pathname
        params = u.searchParams
      } catch {
        path = ''
      }
      if (path !== '/callback' || !params) {
        res
          .writeHead(404, { 'content-type': 'text/plain' })
          .end('Not found')
        return
      }
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' })
        res.end('Method not allowed')
        return
      }
      if (settled) {
        res.writeHead(410, { 'content-type': 'text/plain' }).end('Gone')
        return
      }
      settle({
        kind: 'params',
        state: params.get('state'),
        code: params.get('code'),
        error: params.has('error')
      })
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff'
      })
      res.end(PAGE, () => close())
    }
  )

  const timer = setTimeout(() => {
    settle({ kind: 'failed', message: 'Sign-in timed out' })
    close()
  }, timeoutMs)
  timer.unref?.()

  function close(): void {
    if (closed) return
    closed = true
    clearTimeout(timer)
    settle({ kind: 'failed', message: 'Sign-in was cancelled' })
    server.close()
    server.closeAllConnections()
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const { port } = server.address() as AddressInfo

  return {
    redirectUrl: `http://127.0.0.1:${port}/callback`,
    close,
    async waitForCallback(expectedState: string): Promise<string> {
      const o = await outcome
      if (o.kind === 'failed') throw new Error(o.message)
      if (!stateMatches(expectedState, o.state))
        throw new Error(
          "Sign-in failed: the response didn't match. Try again"
        )
      if (o.error) throw new Error('Sign-in was denied')
      if (!o.code) throw new Error('Sign-in failed: no authorization code')
      return o.code
    }
  }
}
