import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'production-route-fixture',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const path = req.url?.split('?')[0]?.replace(/\/$/, '')
          if (path === '' || path === '/events' || path === '/characters' || path === '/location') {
            req.url = '/e2e/event-filter-sheet-layout/index.html'
          }
          next()
        })
      }
    }
  ],
  cacheDir: resolve(import.meta.dirname, '../../.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b08/vite-cache'),
  resolve: { alias: { '@': resolve(import.meta.dirname, '../../src') } },
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(''),
    __AUTH_DOMAIN__: JSON.stringify('localhost')
  },
  optimizeDeps: { entries: ['e2e/event-filter-sheet-layout/index.html'] },
  server: {
    fs: { allow: [process.cwd(), realpathSync('node_modules')] },
    host: '127.0.0.1',
    port: 15328,
    strictPort: true
  }
})
