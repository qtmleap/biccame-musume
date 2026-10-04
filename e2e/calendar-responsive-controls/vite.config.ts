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
      name: 'calendar-fixture',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.split('?')[0] === '/') req.url = '/e2e/calendar-responsive-controls/index.html'
          next()
        })
      }
    }
  ],
  cacheDir: resolve(import.meta.dirname, '../../.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b03/vite-cache'),
  resolve: { alias: { '@': resolve(import.meta.dirname, '../../workers/app/src') } },
  define: { 'import.meta.env.DEV': 'false', __AUTH_DOMAIN__: JSON.stringify('localhost') },
  optimizeDeps: { entries: ['e2e/calendar-responsive-controls/index.html'] },
  server: {
    host: '127.0.0.1',
    port: 15323,
    strictPort: true,
    fs: {
      allow: [resolve(import.meta.dirname, '../..'), realpathSync(resolve(import.meta.dirname, '../../node_modules'))]
    }
  }
})
