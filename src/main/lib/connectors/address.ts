// Address rules for JSON connector fetches. The user types the URL, so the
// host checks every hop before connecting: link-local (cloud metadata),
// multicast and reserved ranges are refused, and plain http is allowed only
// when every resolved address is on the local network.

import { isIP } from 'node:net'

export class ConnectorFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectorFetchError'
  }
}

export type AddressClass = 'local' | 'public' | 'refused'

function parseIPv4(ip: string): number[] {
  return ip.split('.').map(n => parseInt(n, 10))
}

// 16 bytes. Assumes `ip` already passed isIP() === 6 (zone id stripped).
function parseIPv6(ip: string): number[] {
  // Rewrite a trailing dotted IPv4 (::ffff:1.2.3.4) as two hex groups.
  let text = ip
  const lastColon = text.lastIndexOf(':')
  if (text.includes('.', lastColon)) {
    const v4 = parseIPv4(text.slice(lastColon + 1))
    const hi = ((v4[0] << 8) | v4[1]).toString(16)
    const lo = ((v4[2] << 8) | v4[3]).toString(16)
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`
  }

  const parse = (s: string) =>
    s === '' ? [] : s.split(':').map(g => parseInt(g, 16))
  let groups: number[]
  const dbl = text.indexOf('::')
  if (dbl >= 0) {
    const head = parse(text.slice(0, dbl))
    const rest = parse(text.slice(dbl + 2))
    const zeros = new Array(8 - head.length - rest.length).fill(0)
    groups = [...head, ...zeros, ...rest]
  } else {
    groups = parse(text)
  }

  const bytes: number[] = []
  for (const g of groups) bytes.push((g >> 8) & 0xff, g & 0xff)
  return bytes
}

function classifyV4(b: number[]): AddressClass {
  const [a, b1] = b
  if (a === 0) return 'refused'
  if (a === 169 && b1 === 254) return 'refused'
  if (a >= 224) return 'refused' // 224/4 multicast, 240/4 reserved, broadcast
  if (a === 10 || a === 127) return 'local'
  if (a === 172 && b1 >= 16 && b1 <= 31) return 'local'
  if (a === 192 && b1 === 168) return 'local'
  return 'public'
}

function classifyV6(b: number[]): AddressClass {
  const zero = (from: number, to: number) =>
    b.slice(from, to).every(x => x === 0)

  if (zero(0, 16)) return 'refused' // ::
  if (zero(0, 15) && b[15] === 1) return 'local' // ::1
  // IPv4-mapped ::ffff:a.b.c.d
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff)
    return classifyV4(b.slice(12))
  // IPv4-compatible ::a.b.c.d (deprecated, still unwrap)
  if (zero(0, 12)) return classifyV4(b.slice(12))

  if (b[0] === 0xff) return 'refused' // ff00::/8 multicast
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return 'refused' // fe80::/10
  if ((b[0] & 0xfe) === 0xfc) return 'local' // fc00::/7
  return 'public'
}

// Unknown or invalid input is refused.
export function classifyAddress(ip: string): AddressClass {
  const bare = ip.replace(/^\[|\]$/g, '')
  const version = isIP(bare)
  if (version === 4) return classifyV4(parseIPv4(bare))
  if (version === 6) return classifyV6(parseIPv6(bare.split('%')[0]))
  return 'refused'
}

export function isLocalName(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  return (
    h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')
  )
}

// Throws when this hop must not be fetched. `addrs` are the addresses the
// connection may use; `prev` is the URL that redirected here.
export function checkHop(url: URL, addrs: string[], prev?: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new ConnectorFetchError('Unsupported URL scheme')
  if (addrs.length === 0)
    throw new ConnectorFetchError('Could not resolve host')

  const classes = addrs.map(classifyAddress)
  if (classes.includes('refused'))
    throw new ConnectorFetchError(
      'Link-local and reserved addresses are not allowed'
    )
  if (prev?.protocol === 'https:' && url.protocol === 'http:')
    throw new ConnectorFetchError(
      'Redirect from https to http is not allowed'
    )
  if (url.protocol === 'http:' && !classes.every(c => c === 'local'))
    throw new ConnectorFetchError('Public hosts must use https')
}
