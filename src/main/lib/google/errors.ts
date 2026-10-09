import { NotConnectedError } from './session.js'

// Messages the Car Thing shows when a Google feed has nothing to display.
// The raw error still goes to the log.

export const GOOGLE_DOWN = 'Google is having trouble. Trying again soon'
export const GOOGLE_UNREACHABLE =
  "Can't reach Google. Check this computer's internet connection"
export const GOOGLE_FORBIDDEN =
  'Google refused access. Check the Calendar and Tasks APIs are enabled'

interface HttpError {
  isAxiosError?: boolean
  response?: { status?: number }
}

export function googleErrorMessage(e: unknown): string {
  if (e instanceof NotConnectedError) return e.message

  const err = e as HttpError | null
  if (err?.isAxiosError) {
    const status = err.response?.status
    if (status === undefined) return GOOGLE_UNREACHABLE
    if (status >= 500 || status === 429) return GOOGLE_DOWN
    if (status === 403) return GOOGLE_FORBIDDEN
  }

  return e instanceof Error ? e.message : String(e)
}

// The account behind the feed is gone, so its data should not stay on the
// device.
export function isAccountGone(e: unknown) {
  return e instanceof NotConnectedError
}
