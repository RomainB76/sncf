import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Les tests portent sur la couche métier (pure TypeScript) : l'environnement Node suffit.
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
