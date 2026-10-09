import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

import { resolveRepoSlug } from './src/main/lib/repoSlug.js'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))
const repoSlug = resolveRepoSlug(process.env.GT_REPO, pkg.repository)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __GT_REPO__: JSON.stringify(repoSlug),
      __GOOGLE_CLIENT_ID__: JSON.stringify(
        process.env.GOOGLE_CLIENT_ID ?? ''
      ),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify(
        process.env.GOOGLE_CLIENT_SECRET ?? ''
      )
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    define: {
      __GT_REPO__: JSON.stringify(repoSlug)
    }
  }
})
