declare const __GT_REPO__: string

export function getRepoSlug() {
  return __GT_REPO__
}

export function getClientZipUrl(version: string, slug = getRepoSlug()) {
  return `https://github.com/${slug}/releases/download/v${version}/glancething-client-v${version}.zip`
}

export function getLatestReleaseApiUrl(slug = getRepoSlug()) {
  return `https://api.github.com/repos/${slug}/releases/latest`
}
