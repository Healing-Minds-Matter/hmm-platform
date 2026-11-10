import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // .claude/** — local agent scratch copies of the repo, never part of the suite.
    exclude: ['node_modules/**', '.next/**', '.claude/**'],
  },
})
