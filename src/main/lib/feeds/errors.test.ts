import { describe, expect, it } from 'vitest'

import { describeFetchError, OFFLINE } from './errors.js'

const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status }
  })

const codeError = (code: string, message = code) =>
  Object.assign(new Error(message), { code })

describe('describeFetchError', () => {
  it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT'])(
    'reports %s as the computer being offline',
    code => {
      expect(describeFetchError(codeError(code), 'ESPN')).toEqual({
        message: OFFLINE,
        dropItems: false
      })
    }
  )

  it('treats an axios timeout as offline', () => {
    const e = codeError('ECONNABORTED', 'timeout of 10000ms exceeded')
    expect(describeFetchError(e, 'ESPN').message).toBe(OFFLINE)
  })

  it('names the service on a 5xx and keeps the data', () => {
    expect(describeFetchError(httpError(503), 'Google')).toEqual({
      message: 'Google is having problems (503). Retrying',
      dropItems: false
    })
  })

  it('reports rate limits and other refusals', () => {
    expect(describeFetchError(httpError(429), 'ESPN').message).toBe(
      'ESPN is limiting requests. Retrying'
    )
    expect(describeFetchError(httpError(404), 'ESPN').message).toBe(
      'ESPN refused the request (404)'
    )
  })

  it('falls back to the error message', () => {
    expect(describeFetchError(new Error('Bad nba scoreboard'), 'ESPN')).toEqual(
      { message: 'Bad nba scoreboard', dropItems: false }
    )
    expect(describeFetchError('boom', 'ESPN').message).toBe('boom')
  })
})
