import { readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  cacheDir: resolve(import.meta.dirname, '../../.cache/a15/vite'),
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'local-production-routes',
      resolveId(id) {
        if (id === 'virtual:public-characters') return '\0characters'
      },
      load(id) {
        if (id === '\0characters')
          return `export default ${readFileSync(resolve(import.meta.dirname, '../../public/characters.json'), 'utf8')}`
      },
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (
            /^\/(?:$|(?:events|about|ranking|characters|contact|calendar|me|location|this-does-not-exist)(?:[/?]|$))/.test(
              (req.url || '').split('?')[0]
            )
          )
            req.url = '/e2e/local/index.html'
          next()
        })
      }
    }
  ],
  resolve: {
    alias: [
      { find: '@/lib/firebase', replacement: resolve(import.meta.dirname, 'firebase.ts') },
      { find: '@', replacement: resolve(import.meta.dirname, '../../src') }
    ]
  },
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(''),
    __AUTH_DOMAIN__: JSON.stringify('localhost'),
    __APP_VERSION__: JSON.stringify('fixture'),
    __GIT_HASH__: JSON.stringify('a15'),
    __BUILD_AT__: JSON.stringify('2026-10-02T00:00:00Z')
  },
  optimizeDeps: { entries: ['e2e/local/index.html', 'e2e/local/auth.html'] },
  server: {
    hmr: false,
    watch: null,
    fs: { allow: [resolve(import.meta.dirname, '../..'), realpathSync('node_modules')] },
    host: '127.0.0.1',
    port: 15300,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:15301' }
  }
})
