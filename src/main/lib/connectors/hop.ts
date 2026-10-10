// Per-hop network rules shared by every connector fetch (JSON connectors in
// fetch.ts, MCP and OAuth traffic through safeFetch.ts). Each hop is
// resolved once, checked with `checkHop` (https for public hosts, http only
// when every address is local, link-local/reserved refused, no https → http
// downgrade), and the socket is pinned to the checked address so DNS
// rebinding can't swap it afterwards. Nothing here logs, and error messages
// never include the URL, headers or body.

import { promises as dns } from 'node:dns'
import type https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

import { checkHop, ConnectorFetchError } from './address'

export { checkHop, ConnectorFetchError }

export type Resolve = (host: string) => Promise<string[]>

export async function defaultResolve(host: string): Promise<string[]> {
  const res = await dns.lookup(host, { all: true, verbatim: true })
  return res.map(r => r.address)
}

export function bareHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '')
}

// Resolves and checks one hop. Returns the address to connect to.
// `prev` is the URL that redirected here, if any.
export async function prepareHop(
  url: URL,
  resolveHost: Resolve,
  prev?: URL
): Promise<string> {
  const hostname = bareHostname(url)
  let addrs: string[]
  if (isIP(hostname)) addrs = [hostname]
  else if (url.protocol !== 'http:' && url.protocol !== 'https:') addrs = []
  else {
    try {
      addrs = await resolveHost(hostname)
    } catch {
      throw new ConnectorFetchError('Could not resolve host')
    }
  }
  checkHop(url, addrs, prev)
  return addrs[0]
}

export function pinnedLookup(address: string): LookupFunction {
  const family = isIP(address)
  return ((_host, options, callback) => {
    if ((options as { all?: boolean }).all)
      callback(null, [{ address, family }])
    else callback(null, address, family)
  }) as LookupFunction
}

// Request options for http/https.request that connect only to `address`
// (already checked by prepareHop) while keeping the hostname for Host and SNI.
export function pinnedRequestOptions(
  url: URL,
  address: string
): https.RequestOptions {
  const hostname = bareHostname(url)
  const literal = isIP(hostname) !== 0
  const isHttps = url.protocol === 'https:'
  const options: https.RequestOptions = {
    protocol: url.protocol,
    hostname: literal ? address : hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    agent: false,
    lookup: pinnedLookup(address)
  }
  if (isHttps && !literal) options.servername = hostname
  return options
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
export function toFetchError(e: unknown): ConnectorFetchError {
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
