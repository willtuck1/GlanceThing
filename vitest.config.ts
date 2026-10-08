import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Client tests cover pure modules only (no DOM, no '@/' imports).
    include: ['src/**/*.test.ts', 'client/src/**/*.test.ts'],
    environment: 'node'
  }
})
