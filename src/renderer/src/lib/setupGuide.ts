// The repo this build publishes to, injected by electron.vite.config.ts.
declare const __GT_REPO__: string

export const SETUP_GUIDE_URL = `https://github.com/${__GT_REPO__}/blob/main/docs/SETUP.md`

export const GOOGLE_SETUP_URL = `${SETUP_GUIDE_URL}#3-google-cloud`
