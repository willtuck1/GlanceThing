import { describe, expect, it } from 'vitest'
import { ConnectorFetchError } from './address'
import { plainError } from './errors'

const fe = (m: string) => new ConnectorFetchError(m)

describe('plainError', () => {
  it.each([
    ['Response is not JSON', "This address didn't return JSON"],
    ['Response is not valid JSON', "This address didn't return JSON"],
    [
      'Could not resolve host',
      "Couldn't find that server. Check the address."
    ],
    ['Timed out', 'The server took too long to answer'],
    [
      'TLS certificate error',
      "The server's security certificate isn't valid"
    ],
    ['TLS error', "The server's security certificate isn't valid"],
    [
      'Link-local and reserved addresses are not allowed',
      "That address isn't allowed (private or reserved network)"
    ],
    [
      'Public hosts must use https',
      'This address must start with https://'
    ],
    [
      'Redirect from https to http is not allowed',
      'This address must start with https://'
    ]
  ])('maps %s', (message, expected) => {
    expect(plainError(fe(message))).toBe(expected)
  })

  it('maps HTTP statuses', () => {
    expect(plainError(fe('HTTP 401'))).toBe('The key was refused (401)')
    expect(plainError(fe('HTTP 403'))).toBe('The key was refused (403)')
    expect(plainError(fe('HTTP 404'))).toBe(
      'Nothing found at this address (404)'
    )
    expect(plainError(fe('HTTP 429'))).toBe(
      'Too many requests; try again later (429)'
    )
    expect(plainError(fe('HTTP 500'))).toBe(
      'The server returned an error (500)'
    )
    expect(plainError(fe('HTTP 418'))).toBe(
      'The server returned an error (418)'
    )
  })

  it('says a key is needed when none is set', () => {
    expect(plainError(fe('HTTP 401'), { secretSet: false })).toBe(
      'This address needs a key (401)'
    )
    expect(plainError(fe('HTTP 403'), { secretSet: false })).toBe(
      'This address needs a key (403)'
    )
    expect(plainError(fe('HTTP 401'), { secretSet: true })).toBe(
      'The key was refused (401)'
    )
    expect(plainError(fe('HTTP 404'), { secretSet: false })).toBe(
      'Nothing found at this address (404)'
    )
  })

  it('maps a non-list items path', () => {
    expect(plainError(new Error('Items path is not a list'))).toBe(
      'No list found; pick one in the tree'
    )
  })

  it('falls back without echoing the message', () => {
    const fallback = "Couldn't load data from this address"
    for (const e of [
      fe('Request failed'),
      fe('Response too large'),
      fe('Invalid URL'),
      fe('HTTP 302'),
      fe('HTTP 99'),
      new Error('https://example.com/?key=secret'),
      'string',
      null,
      undefined
    ])
      expect(plainError(e)).toBe(fallback)
    expect(plainError(fe('HTTP 500 secret-abc'))).not.toContain('secret')
  })
})
