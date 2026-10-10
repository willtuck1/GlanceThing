import { describe, expect, it } from 'vitest'

import {
  checkHop,
  classifyAddress,
  ConnectorFetchError,
  isLocalName
} from './address'

describe('classifyAddress', () => {
  it.each([
    ['10.0.0.1', 'local'],
    ['172.16.0.1', 'local'],
    ['172.31.255.255', 'local'],
    ['172.15.0.1', 'public'],
    ['172.32.0.1', 'public'],
    ['192.168.1.5', 'local'],
    ['127.0.0.1', 'local'],
    ['8.8.8.8', 'public'],
    ['100.64.0.1', 'public'],
    ['169.254.169.254', 'refused'],
    ['0.0.0.0', 'refused'],
    ['0.1.2.3', 'refused'],
    ['224.0.0.1', 'refused'],
    ['239.255.255.250', 'refused'],
    ['240.0.0.1', 'refused'],
    ['255.255.255.255', 'refused'],
    ['::1', 'local'],
    ['0:0:0:0:0:0:0:1', 'local'],
    ['::', 'refused'],
    ['fd00::1', 'local'],
    ['fc00::1', 'local'],
    ['fe80::1', 'refused'],
    ['fe80::1%eth0', 'refused'],
    ['febf::1', 'refused'],
    ['fec0::1', 'public'],
    ['ff02::1', 'refused'],
    ['2001:4860:4860::8888', 'public'],
    ['2001:db8:0:0:0:0:0:1', 'public'],
    ['::ffff:192.168.1.5', 'local'],
    ['::ffff:169.254.1.1', 'refused'],
    ['::ffff:8.8.8.8', 'public'],
    ['::ffff:c0a8:0101', 'local'],
    ['::ffff:a9fe:0101', 'refused'],
    ['0:0:0:0:0:ffff:7f00:1', 'local'],
    ['::127.0.0.1', 'local'],
    ['::169.254.1.1', 'refused'],
    ['64:ff9b::a9fe:a9fe', 'refused'],
    ['64:ff9b::808:808', 'public'],
    ['64:ff9b::c0a8:0101', 'local'],
    ['2002:a9fe:a9fe::', 'refused'],
    ['2002:c0a8:0101::', 'local'],
    ['2002:808:808::1', 'public'],
    ['[::1]', 'local'],
    ['not-an-ip', 'refused']
  ])('%s is %s', (ip, expected) => {
    expect(classifyAddress(ip)).toBe(expected)
  })
})

describe('isLocalName', () => {
  it.each([
    ['localhost', true],
    ['LOCALHOST.', true],
    ['api.localhost', true],
    ['printer.local', true],
    ['Printer.Local.', true],
    ['example.com', false],
    ['localhost.example.com', false],
    ['notlocal', false]
  ])('%s → %s', (name, expected) => {
    expect(isLocalName(name)).toBe(expected)
  })
})

describe('checkHop', () => {
  const u = (s: string) => new URL(s)
  const err = (fn: () => void) => {
    try {
      fn()
    } catch (e) {
      expect(e).toBeInstanceOf(ConnectorFetchError)
      return (e as Error).message
    }
    return null
  }

  it('allows http to a public name resolving only to private addresses', () => {
    expect(
      err(() => checkHop(u('http://nas.example.com/x'), ['192.168.1.2']))
    ).toBeNull()
  })

  it('refuses http to a .local name resolving to a public address', () => {
    expect(err(() => checkHop(u('http://box.local/x'), ['8.8.8.8']))).toBe(
      'Public hosts must use https'
    )
  })

  it('refuses http to a public address', () => {
    expect(
      err(() => checkHop(u('http://example.com/'), ['93.184.216.34']))
    ).toBe('Public hosts must use https')
  })

  it('refuses http when local and public addresses are mixed', () => {
    expect(
      err(() =>
        checkHop(u('http://example.com/'), ['10.0.0.1', '93.184.216.34'])
      )
    ).toBe('Public hosts must use https')
  })

  it('allows https to a public address', () => {
    expect(
      err(() => checkHop(u('https://example.com/'), ['93.184.216.34']))
    ).toBeNull()
  })

  it('refuses link-local even over https', () => {
    expect(
      err(() => checkHop(u('https://meta.example/'), ['169.254.169.254']))
    ).toBe('Link-local and reserved addresses are not allowed')
    expect(
      err(() =>
        checkHop(u('https://example.com/'), ['93.184.216.34', 'fe80::1'])
      )
    ).toBe('Link-local and reserved addresses are not allowed')
  })

  it('refuses https → http redirects even to a local host', () => {
    expect(
      err(() =>
        checkHop(
          u('http://127.0.0.1/'),
          ['127.0.0.1'],
          u('https://example.com/')
        )
      )
    ).toBe('Redirect from https to http is not allowed')
  })

  it('allows http → https redirects', () => {
    expect(
      err(() =>
        checkHop(
          u('https://example.com/'),
          ['93.184.216.34'],
          u('http://nas.local/')
        )
      )
    ).toBeNull()
  })

  it('refuses empty address lists', () => {
    expect(err(() => checkHop(u('https://example.com/'), []))).toBe(
      'Could not resolve host'
    )
  })

  it('refuses other schemes', () => {
    expect(
      err(() => checkHop(u('file:///etc/passwd'), ['127.0.0.1']))
    ).toBe('Unsupported URL scheme')
    expect(
      err(() => checkHop(u('ftp://example.com/'), ['127.0.0.1']))
    ).toBe('Unsupported URL scheme')
  })
})
