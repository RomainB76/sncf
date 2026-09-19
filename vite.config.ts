import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cleServer } from './dev-server/cleServer.ts'

// https://vite.dev/config/
export default defineConfig({
  // Relative paths: the build works from any sub-folder of a static server.
  base: './',
  plugins: [vue(), cleServer()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2022',
    // ECharts and SheetJS are large by nature; they are isolated in chunks loaded on demand.
    chunkSizeWarningLimit: 1200,
  },
})
