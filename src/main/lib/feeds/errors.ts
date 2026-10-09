// Turns a failed fetch into a message for the Car Thing. The raw axios text
// ("getaddrinfo ENOTFOUND ...") means nothing on a dashboard.

export interface FeedError {
  message: string
  // The data can't be trusted any more (e.g. the account is gone), so the
  // feed forgets it instead of showing it as stale.
  dropItems: boolean
}

export const OFFLINE = 'The computer is offline. Retrying'

const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ERR_NETWORK'
])

interface HttpLikeError {
  code?: unknown
  message?: unknown
  response?: { status?: unknown }
}

export function httpStatus(e: unknown): number | null {
  const status = (e as HttpLikeError | null)?.response?.status
  return typeof status === 'number' ? status : null
}

function isNetworkError(e: unknown) {
  const err = e as HttpLikeError | null
  if (typeof err?.code === 'string' && NETWORK_CODES.has(err.code))
    return true
  // axios: a request that went out but got no response at all.
  return (
    httpStatus(e) === null &&
    typeof err?.message === 'string' &&
    /timeout|network error/i.test(err.message)
  )
}

export function describeFetchError(
  e: unknown,
  service: string
): FeedError {
  const status = httpStatus(e)

  if (status === null && isNetworkError(e))
    return { message: OFFLINE, dropItems: false }
  if (status !== null && status >= 500)
    return {
      message: `${service} is having problems (${status}). Retrying`,
      dropItems: false
    }
  if (status === 429)
    return {
      message: `${service} is limiting requests. Retrying`,
      dropItems: false
    }
  if (status !== null)
    return {
      message: `${service} refused the request (${status})`,
      dropItems: false
    }

  return {
    message: e instanceof Error ? e.message : String(e),
    dropItems: false
  }
}
