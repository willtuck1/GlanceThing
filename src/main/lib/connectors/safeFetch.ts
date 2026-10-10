// A WHATWG fetch for MCP and OAuth traffic that enforces the connector
// network rules (hop.ts) on every hop, including the first: the host is
// resolved once, checked, and the socket is pinned to the checked address.
// Uses Node http/https directly because global fetch can't be pinned.
//
// - Redirects are followed manually (at most `maxRedirects`) and every target
//   is re-checked. 301/302/303 become GET without a body (301/302 from HEAD
//   stay HEAD); 307/308 keep method and body. A cross-origin hop drops
//   Authorization, Cookie, Proxy-Authorization and `sensitiveHeaders` for
//   the rest of the chain. `redirect: 'manual'` returns the 3xx response
//   unfollowed (the MCP SDK uses this); `redirect: 'error'` refuses it.
// - One timeout covers the whole request, including reading the body. On
//   timeout or caller abort the socket is destroyed.
// - The body streams chunk by chunk (SSE works) and errors once more than
//   `maxBytes` have been read in total.
// - `response.url` and `response.redirected` are set on the instance.
// - Error messages are fixed strings: never the URL, headers or body. No
//   proxy or environment handling, and no logging.

import http from 'node:http'
import https from 'node:https'

import {
  ConnectorFetchError,
  defaultResolve,
  pinnedRequestOptions,
  prepareHop,
  type Resolve,
  toFetchError
} from './hop'

export interface SafeFetchOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  // Extra header names dropped on a cross-origin redirect.
  sensitiveHeaders?: string[]
  // Tests only.
  resolve?: Resolve
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_BYTES = 1_048_576
const DEFAULT_MAX_REDIRECTS = 3

const REDIRECTS = new Set([301, 302, 303, 307, 308])
const NULL_BODY_STATUS = new Set([204, 205, 304])
const CROSS_ORIGIN_DROP = ['authorization', 'cookie', 'proxy-authorization']
const BODY_HEADERS = [
  'content-type',
  'content-length',
  'content-encoding',
  'content-language',
  'content-location'
]
// Set by this module (or by Node) and never taken from the caller.
const CONTROLLED_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'content-length',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'accept-encoding'
])

class AbortError extends Error {
  constructor() {
    super('Request aborted')
    this.name = 'AbortError'
  }
}

interface Prepared {
  url: URL
  method: string
  headers: Record<string, string>
  body: Buffer | null
  signal: AbortSignal | null | undefined
  redirect: RequestRedirect
}

function toBody(
  body: unknown,
  headers: Record<string, string>
): Buffer | null {
  if (body === null || body === undefined) return null
  let defaultType: string | undefined
  let buf: Buffer
  if (typeof body === 'string') {
    buf = Buffer.from(body, 'utf8')
    defaultType = 'text/plain;charset=UTF-8'
  } else if (body instanceof URLSearchParams) {
    buf = Buffer.from(body.toString(), 'utf8')
    defaultType = 'application/x-www-form-urlencoded;charset=UTF-8'
  } else if (body instanceof ArrayBuffer) {
    buf = Buffer.from(new Uint8Array(body))
  } else if (ArrayBuffer.isView(body)) {
    buf = Buffer.from(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    )
  } else {
    throw new TypeError('Unsupported request body type')
  }
  if (defaultType && !headers['content-type'])
    headers['content-type'] = defaultType
  return buf
}

async function prepare(
  input: string | URL | Request,
  init: RequestInit
): Promise<Prepared> {
  const req = input instanceof Request ? input : undefined
  let url: URL
  try {
    url = new URL(req ? req.url : String(input))
  } catch {
    throw new TypeError('Invalid URL')
  }
  if (url.username || url.password)
    throw new TypeError('URL credentials are not allowed')
  url.hash = ''

  const method = (init.method ?? req?.method ?? 'GET').toUpperCase()

  const headers: Record<string, string> = {}
  let source: Headers
  try {
    source = new Headers(init.headers ?? req?.headers)
  } catch {
    throw new TypeError('Invalid header')
  }
  source.forEach((value, name) => {
    if (!CONTROLLED_HEADERS.has(name)) headers[name] = value
  })

  let rawBody: unknown = init.body
  if (rawBody === undefined && req?.body) rawBody = await req.arrayBuffer()
  const body = toBody(rawBody, headers)
  if (body && (method === 'GET' || method === 'HEAD'))
    throw new TypeError('GET and HEAD requests cannot have a body')

  return {
    url,
    method,
    headers,
    body,
    signal: init.signal ?? req?.signal,
    redirect: init.redirect ?? req?.redirect ?? 'follow'
  }
}

function requestOnce(
  url: URL,
  address: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer | null,
  signal: AbortSignal
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const sent: Record<string, string> = {
      accept: '*/*',
      'user-agent': 'GlanceThing',
      ...headers,
      'accept-encoding': 'identity'
    }
    if (body) sent['content-length'] = String(body.length)
    else if (method !== 'GET' && method !== 'HEAD')
      sent['content-length'] = '0'

    const options: https.RequestOptions = {
      ...pinnedRequestOptions(url, address),
      method,
      headers: sent,
      signal
    }
    const mod = url.protocol === 'https:' ? https : http
    const req = mod.request(options, resolve)
    req.on('error', reject)
    req.end(body ?? undefined)
  })
}

function untilAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new AbortError())
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(resolve, reject).finally(() =>
      signal.removeEventListener('abort', onAbort)
    )
  })
}

function toHeaders(res: http.IncomingMessage): Headers {
  const headers = new Headers()
  const raw = res.rawHeaders
  for (let i = 0; i + 1 < raw.length; i += 2) {
    try {
      headers.append(raw[i], raw[i + 1])
    } catch {
      // Skip a header the Headers class won't accept.
    }
  }
  return headers
}

export function createSafeFetch(opts: SafeFetchOptions = {}): typeof fetch {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const resolveHost = opts.resolve ?? defaultResolve
  const dropCrossOrigin = [
    ...CROSS_ORIGIN_DROP,
    ...(opts.sensitiveHeaders ?? []).map(h => h.toLowerCase())
  ]

  const safeFetch = async (
    input: string | URL | Request,
    init: RequestInit = {}
  ): Promise<Response> => {
    const p = await prepare(input, init)
    const callerSignal = p.signal ?? undefined
    if (callerSignal?.aborted) throw new AbortError()

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const onCallerAbort = () => controller.abort()
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
    const cleanup = () => {
      clearTimeout(timer)
      callerSignal?.removeEventListener('abort', onCallerAbort)
    }
    const abortError = () =>
      timedOut ? new ConnectorFetchError('Timed out') : new AbortError()

    let current = p.url
    let prev: URL | undefined
    let method = p.method
    let body = p.body
    const headers = p.headers
    let res: http.IncomingMessage

    try {
      for (let hop = 0; ; hop++) {
        if (hop > maxRedirects)
          throw new ConnectorFetchError('Too many redirects')

        const address = await untilAbort(
          prepareHop(current, resolveHost, prev),
          controller.signal
        )
        res = await requestOnce(
          current,
          address,
          method,
          headers,
          body,
          controller.signal
        )

        const status = res.statusCode ?? 0
        const location = res.headers.location
        if (!REDIRECTS.has(status) || !location || p.redirect === 'manual')
          break

        res.destroy()
        if (p.redirect === 'error')
          throw new ConnectorFetchError('Redirect not allowed')
        let next: URL
        try {
          next = new URL(location, current)
        } catch {
          throw new ConnectorFetchError('Invalid redirect')
        }
        if (next.username || next.password)
          throw new ConnectorFetchError('Invalid redirect')
        next.hash = ''

        if (status === 301 || status === 302 || status === 303) {
          if (status === 303 || method !== 'HEAD') method = 'GET'
          body = null
          for (const h of BODY_HEADERS) delete headers[h]
        }
        if (next.origin !== current.origin)
          for (const h of dropCrossOrigin) delete headers[h]

        prev = current
        current = next
      }
    } catch (e) {
      cleanup()
      controller.abort()
      if (timedOut || callerSignal?.aborted) throw abortError()
      throw toFetchError(e)
    }

    return buildResponse(res, {
      url: current,
      redirected: prev !== undefined,
      method,
      maxBytes,
      signal: controller.signal,
      cleanup,
      abortError
    })
  }

  return safeFetch as typeof fetch
}

interface BuildContext {
  url: URL
  redirected: boolean
  method: string
  maxBytes: number
  signal: AbortSignal
  cleanup: () => void
  abortError: () => Error
}

function buildResponse(
  res: http.IncomingMessage,
  ctx: BuildContext
): Response {
  const status = res.statusCode ?? 0
  const fail = (message: string): never => {
    res.destroy()
    ctx.cleanup()
    throw new ConnectorFetchError(message)
  }
  if (status < 200 || status > 599) fail('Invalid response')
  const length = Number(res.headers['content-length'])
  if (Number.isFinite(length) && length > ctx.maxBytes)
    fail('Response too large')

  let stream: ReadableStream<Uint8Array> | null = null
  if (ctx.method === 'HEAD' || NULL_BODY_STATUS.has(status)) {
    res.destroy()
    ctx.cleanup()
  } else {
    let total = 0
    let finished = false
    const finish = () => {
      finished = true
      ctx.cleanup()
      ctx.signal.removeEventListener('abort', onAbort)
    }
    let streamController!: ReadableStreamDefaultController<Uint8Array>
    const error = (e: Error) => {
      if (finished) return
      finish()
      res.destroy()
      streamController.error(e)
    }
    const onAbort = () => error(ctx.abortError())
    stream = new ReadableStream<Uint8Array>({
      start(c) {
        streamController = c
        res.on('data', (chunk: Buffer) => {
          if (finished) return
          total += chunk.length
          if (total > ctx.maxBytes) {
            error(new ConnectorFetchError('Response too large'))
            return
          }
          c.enqueue(new Uint8Array(chunk))
          if ((c.desiredSize ?? 1) <= 0) res.pause()
        })
        res.on('end', () => {
          if (finished) return
          finish()
          c.close()
        })
        res.on('error', e =>
          error(ctx.signal.aborted ? ctx.abortError() : toFetchError(e))
        )
        res.on('close', () => {
          if (!finished)
            error(
              ctx.signal.aborted
                ? ctx.abortError()
                : new ConnectorFetchError('Connection reset')
            )
        })
        if (ctx.signal.aborted) onAbort()
        else ctx.signal.addEventListener('abort', onAbort, { once: true })
      },
      pull() {
        res.resume()
      },
      cancel() {
        if (finished) return
        finish()
        res.destroy()
      }
    })
  }

  const response = new Response(stream, {
    status,
    statusText: res.statusMessage ?? '',
    headers: toHeaders(res)
  })
  Object.defineProperty(response, 'url', { value: ctx.url.href })
  Object.defineProperty(response, 'redirected', { value: ctx.redirected })
  return response
}

export const safeFetch = createSafeFetch()
