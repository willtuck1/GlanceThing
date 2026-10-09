import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': resolve('client/src') }
  },
  test: {
    // Client tests run without a DOM; they may import components but not
    // render them.
    include: ['src/**/*.test.ts', 'client/src/**/*.test.ts'],
    environment: 'node'
  }
})
