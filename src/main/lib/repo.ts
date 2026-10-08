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

// The recipient setup guide, linked from the desktop app when Google is not
// set up. Follows the repo the build was made from.
export function getSetupGuideUrl(slug = getRepoSlug()) {
  return `https://github.com/${slug}/blob/main/docs/SETUP.md`
}
