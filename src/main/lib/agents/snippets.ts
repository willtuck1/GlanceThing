/** Pure helpers that build the copy-paste commands shown in Settings. */

function check(adapterId: string | null, port: number, token: string): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid port')
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Invalid token')
  if (adapterId !== null && !/^[a-z0-9-]{1,24}$/.test(adapterId))
    throw new Error('Invalid adapter id')
}

/** Shell command a hook runs; the hook payload arrives on stdin. */
export function hookCommand(
  adapterId: string,
  port: number,
  token: string
): string {
  check(adapterId, port, token)
  return `curl -s -m 2 -X POST http://127.0.0.1:${port}/v1/hook/${adapterId} -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" --data-binary @- || true`
}

/** Example body for the generic `/v1/status` endpoint. */
export const customExampleBody = {
  source: 'custom',
  sessionId: 'demo',
  label: 'my-script',
  state: 'working',
  detail: 'Running'
}

/**
 * One-line curl example. The JSON is double-quoted with escaped quotes so it
 * works in cmd and POSIX shells. PowerShell users should run `curl.exe`
 * (plain `curl` is an alias for Invoke-WebRequest there).
 */
export function customCurl(port: number, token: string): string {
  check(null, port, token)
  return `curl -s -m 2 -X POST http://127.0.0.1:${port}/v1/status -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d "{\\"source\\":\\"custom\\",\\"sessionId\\":\\"demo\\",\\"label\\":\\"my-script\\",\\"state\\":\\"working\\",\\"detail\\":\\"Running\\"}"`
}
