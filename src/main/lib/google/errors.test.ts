import { describe, expect, it } from 'vitest'

import {
  GOOGLE_DOWN,
  GOOGLE_FORBIDDEN,
  GOOGLE_UNREACHABLE,
  googleErrorMessage,
  isAccountGone
} from './errors.js'
import { NotConnectedError, REVOKED } from './session.js'

function httpError(status?: number) {
  return Object.assign(new Error(`Request failed with status ${status}`), {
    isAxiosError: true,
    response: status === undefined ? undefined : { status }
  })
}

describe('googleErrorMessage', () => {
  it('passes account messages through', () => {
    expect(googleErrorMessage(new NotConnectedError(REVOKED))).toBe(REVOKED)
  })

  it('explains server errors and rate limits', () => {
    expect(googleErrorMessage(httpError(503))).toBe(GOOGLE_DOWN)
    expect(googleErrorMessage(httpError(500))).toBe(GOOGLE_DOWN)
    expect(googleErrorMessage(httpError(429))).toBe(GOOGLE_DOWN)
  })

  it('explains a missing network', () => {
    expect(googleErrorMessage(httpError())).toBe(GOOGLE_UNREACHABLE)
  })

  it('points at the APIs on 403', () => {
    expect(googleErrorMessage(httpError(403))).toBe(GOOGLE_FORBIDDEN)
  })

  it('falls back to the raw message', () => {
    expect(googleErrorMessage(httpError(404))).toBe(
      'Request failed with status 404'
    )
    expect(googleErrorMessage('boom')).toBe('boom')
  })
})

describe('isAccountGone', () => {
  it('is true only for account errors', () => {
    expect(isAccountGone(new NotConnectedError())).toBe(true)
    expect(isAccountGone(httpError(503))).toBe(false)
  })
})
