import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// The tests cover the business layer (pure TypeScript): the Node environment is enough.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
