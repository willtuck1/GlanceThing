// Turns the internal connector errors into short, fixed, plain-language
// strings for Settings. The result never echoes the input message, so it
// can't carry a URL or secret.

const FALLBACK = "Couldn't load data from this address"
const NOT_ALLOWED =
  "That address isn't allowed (private or reserved network)"

const MUST_HTTPS = 'This address must start with https://'

const EXACT: Record<string, string> = {
  'Response is not JSON': "This address didn't return JSON",
  'Response is not valid JSON': "This address didn't return JSON",
  'Could not resolve host':
    "Couldn't find that server. Check the address.",
  'Timed out': 'The server took too long to answer',
  'TLS certificate error': "The server's security certificate isn't valid",
  'TLS error': "The server's security certificate isn't valid",
  'Link-local and reserved addresses are not allowed': NOT_ALLOWED,
  'Public hosts must use https': MUST_HTTPS,
  'Redirect from https to http is not allowed': MUST_HTTPS,
  'Items path is not a list': 'No list found; pick one in the tree'
}

export function plainError(
  e: unknown,
  ctx: { secretSet?: boolean } = {}
): string {
  const message = e instanceof Error ? e.message : ''
  const http = /^HTTP (\d{3})$/.exec(message)
  if (http) {
    const code = Number(http[1])
    if (code === 401 || code === 403)
      return ctx.secretSet === false
        ? `This address needs a key (${code})`
        : `The key was refused (${code})`
    if (code === 404) return 'Nothing found at this address (404)'
    if (code === 429) return 'Too many requests; try again later (429)'
    if (code >= 400 && code <= 599)
      return `The server returned an error (${code})`
    return FALLBACK
  }
  return Object.hasOwn(EXACT, message) ? EXACT[message] : FALLBACK
}
