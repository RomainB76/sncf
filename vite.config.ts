import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { serveurCle } from './dev-server/serveurCle.ts'

// https://vite.dev/config/
export default defineConfig({
  // Chemins relatifs : le build fonctionne depuis n'importe quel sous-dossier d'un serveur statique.
  base: './',
  plugins: [vue(), serveurCle()],
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
    // ECharts et SheetJS sont volumineux par nature ; ils sont isolés dans des chunks chargés à la demande.
    chunkSizeWarningLimit: 1200,
  },
})
