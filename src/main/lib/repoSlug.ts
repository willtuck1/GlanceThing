const SLUG_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export function parseRepoSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim().replace(/^github:/, '')
  if (SLUG_PATTERN.test(trimmed)) return trimmed

  const match = trimmed.match(
    /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/
  )
  return match ? `${match[1]}/${match[2]}` : null
}

export function resolveRepoSlug(
  envValue: string | undefined,
  packageRepository: unknown
): string {
  const repository =
    typeof packageRepository === 'object' && packageRepository !== null
      ? (packageRepository as { url?: unknown }).url
      : packageRepository

  const slug = parseRepoSlug(envValue) ?? parseRepoSlug(repository)
  if (!slug) throw new Error('Could not resolve the GitHub repo slug')

  return slug
}
