// Fetches a user-configured JSON connector URL. Every hop (including
// redirects) is resolved once, checked with `checkHop`, and the socket is
// pinned to a checked address so DNS rebinding can't swap it afterwards.
// Error messages never include the URL or the secret header value, and this
// module logs nothing.

import http from 'node:http'
import https from 'node:https'

import {
  ConnectorFetchError,
  defaultResolve,
  pinnedRequestOptions,
  prepareHop,
  toFetchError
} from './hop'

export { ConnectorFetchError }

export interface HopResult {
  redirect?: URL
  body?: unknown
}

// One request to an already-checked hop. Injected only by tests.
export type HopRequest = (
  url: URL,
  address: string,
  headers: Record<string, string>,
  maxBytes: number,
  signal: AbortSignal
) => Promise<HopResult>

export interface FetchDeps {
  resolve?: (host: string) => Promise<string[]>
  request?: HopRequest
  timeoutMs?: number
  maxBytes?: number
}

export interface FetchOptions {
  header?: { name: string; value: string }
  deps?: FetchDeps
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_BYTES = 1_000_000
const MAX_REDIRECTS = 3
const REDIRECTS = new Set([301, 302, 303, 307, 308])

function isJsonType(contentType: string | undefined): boolean {
  if (!contentType) return false
  const type = contentType.split(';')[0].trim().toLowerCase()
  return (
    type === 'application/json' || /^[^/\s]+\/[^/\s]+\+json$/.test(type)
  )
}

function requestHop(
  url: URL,
  address: string,
  headers: Record<string, string>,
  maxBytes: number,
  signal: AbortSignal
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:'
    const options: https.RequestOptions = {
      ...pinnedRequestOptions(url, address),
      method: 'GET',
      headers,
      signal
    }

    const req = (isHttps ? https : http).request(options, res => {
      const status = res.statusCode ?? 0

      if (REDIRECTS.has(status) && res.headers.location) {
        let next: URL
        try {
          next = new URL(res.headers.location, url)
        } catch {
          res.destroy()
          reject(new ConnectorFetchError('Invalid redirect'))
          return
        }
        res.destroy()
        resolve({ redirect: next })
        return
      }

      const fail = (message: string) => {
        res.destroy()
        reject(new ConnectorFetchError(message))
      }

      if (status < 200 || status >= 300) return fail(`HTTP ${status}`)
      if (!isJsonType(res.headers['content-type']))
        return fail('Response is not JSON')
      const length = Number(res.headers['content-length'])
      if (Number.isFinite(length) && length > maxBytes)
        return fail('Response too large')

      const chunks: Buffer[] = []
      let size = 0
      let done = false
      res.on('data', (chunk: Buffer) => {
        if (done) return
        size += chunk.length
        if (size > maxBytes) {
          done = true
          fail('Response too large')
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => {
        if (done) return
        done = true
        try {
          resolve({
            body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
          })
        } catch {
          reject(new ConnectorFetchError('Response is not valid JSON'))
        }
      })
      res.on('error', e => {
        if (done) return
        done = true
        reject(toFetchError(e))
      })
    })
    req.on('error', e => reject(toFetchError(e)))
    req.end()
  })
}

export async function fetchConnectorJson(
  url: string,
  opts: FetchOptions = {}
): Promise<unknown> {
  const resolveHost = opts.deps?.resolve ?? defaultResolve
  const request = opts.deps?.request ?? requestHop
  const timeoutMs = opts.deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = opts.deps?.maxBytes ?? DEFAULT_MAX_BYTES

  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new ConnectorFetchError('Timed out'))
    }, timeoutMs)
  })

  const run = async (): Promise<unknown> => {
    let current: URL
    try {
      current = new URL(url)
    } catch {
      throw new ConnectorFetchError('Invalid URL')
    }
    const origin = current.origin
    let prev: URL | undefined

    for (let hop = 0; ; hop++) {
      if (hop > MAX_REDIRECTS)
        throw new ConnectorFetchError('Too many redirects')

      const address = await prepareHop(current, resolveHost, prev)

      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Accept-Encoding': 'identity',
        'User-Agent': 'GlanceThing'
      }
      if (opts.header && current.origin === origin)
        headers[opts.header.name] = opts.header.value

      const result = await request(
        current,
        address,
        headers,
        maxBytes,
        controller.signal
      )
      if (!result.redirect) return result.body
      prev = current
      current = result.redirect
    }
  }

  try {
    return await Promise.race([run(), timeout])
  } catch (e) {
    throw toFetchError(e)
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
