// Fetches a user-configured JSON connector URL. Every hop (including
// redirects) is resolved once, checked with `checkHop`, and the socket is
// pinned to a checked address so DNS rebinding can't swap it afterwards.
// Error messages never include the URL or the secret header value, and this
// module logs nothing.

import { promises as dns } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

import { checkHop, ConnectorFetchError } from './address'

export { ConnectorFetchError }

export interface FetchDeps {
  resolve?: (host: string) => Promise<string[]>
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

async function defaultResolve(host: string): Promise<string[]> {
  const res = await dns.lookup(host, { all: true, verbatim: true })
  return res.map(r => r.address)
}

const NETWORK_MESSAGES: Record<string, string> = {
  ECONNREFUSED: 'Connection refused',
  ECONNRESET: 'Connection reset',
  EPIPE: 'Connection reset',
  ENOTFOUND: 'Could not resolve host',
  EAI_AGAIN: 'Could not resolve host',
  ETIMEDOUT: 'Timed out',
  EHOSTUNREACH: 'Host unreachable',
  ENETUNREACH: 'Host unreachable'
}

const TLS_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'CERT_UNTRUSTED',
  'CERT_REJECTED',
  'ERR_TLS_CERT_ALTNAME_INVALID'
])

// Never passes through the original message: Node puts hosts and header
// names/values in some of them.
function toFetchError(e: unknown): ConnectorFetchError {
  if (e instanceof ConnectorFetchError) return e
  const code = (e as { code?: unknown } | null)?.code
  if (typeof code === 'string') {
    if (NETWORK_MESSAGES[code])
      return new ConnectorFetchError(NETWORK_MESSAGES[code])
    if (TLS_CODES.has(code) || code.startsWith('CERT_'))
      return new ConnectorFetchError('TLS certificate error')
    if (code.startsWith('ERR_SSL_') || code.startsWith('ERR_TLS_'))
      return new ConnectorFetchError('TLS error')
    if (code === 'ERR_INVALID_CHAR' || code === 'ERR_INVALID_HTTP_TOKEN')
      return new ConnectorFetchError('Invalid header')
  }
  return new ConnectorFetchError('Request failed')
}

function isJsonType(contentType: string | undefined): boolean {
  if (!contentType) return false
  const type = contentType.split(';')[0].trim().toLowerCase()
  return (
    type === 'application/json' || /^[^/\s]+\/[^/\s]+\+json$/.test(type)
  )
}

function pinnedLookup(address: string): LookupFunction {
  const family = isIP(address)
  return ((_host, options, callback) => {
    if ((options as { all?: boolean }).all)
      callback(null, [{ address, family }])
    else callback(null, address, family)
  }) as LookupFunction
}

interface HopResult {
  redirect?: URL
  body?: unknown
}

function requestHop(
  url: URL,
  address: string,
  headers: Record<string, string>,
  maxBytes: number,
  signal: AbortSignal
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const literal = isIP(hostname) !== 0
    const isHttps = url.protocol === 'https:'
    const options: https.RequestOptions = {
      method: 'GET',
      protocol: url.protocol,
      hostname: literal ? address : hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers,
      agent: false,
      signal,
      lookup: pinnedLookup(address)
    }
    if (isHttps && !literal) options.servername = hostname

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

      const hostname = current.hostname.replace(/^\[|\]$/g, '')
      let addrs: string[]
      if (isIP(hostname)) addrs = [hostname]
      else if (
        current.protocol !== 'http:' &&
        current.protocol !== 'https:'
      )
        addrs = []
      else {
        try {
          addrs = await resolveHost(hostname)
        } catch {
          throw new ConnectorFetchError('Could not resolve host')
        }
      }
      checkHop(current, addrs, prev)

      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Accept-Encoding': 'identity',
        'User-Agent': 'GlanceThing'
      }
      if (opts.header && current.origin === origin)
        headers[opts.header.name] = opts.header.value

      const result = await requestHop(
        current,
        addrs[0],
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
