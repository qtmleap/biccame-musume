import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 実際の操作とレスポンシブCSSを、外部サービスなしで検証する。
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'fixture-public-characters',
      resolveId: (id) => (id === 'virtual:public-characters' ? '\0fixture-characters' : undefined),
      load: (id) => (id === '\0fixture-characters' ? 'export default []' : undefined)
    }
  ],
  cacheDir: resolve(import.meta.dirname, '../../.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b05/vite-cache'),
  resolve: {
    alias: [
      { find: '@/hooks/use-auth', replacement: resolve(import.meta.dirname, 'auth-adapter.ts') },
      { find: '@', replacement: resolve(import.meta.dirname, '../../src') }
    ]
  },
  define: {
    'import.meta.env.DEV': 'false',
    __AUTH_DOMAIN__: JSON.stringify('localhost')
  },
  optimizeDeps: { entries: ['e2e/character-detail-layout/index.html'] },
  server: {
    fs: {
      allow: [resolve(import.meta.dirname, '../..'), realpathSync(resolve(import.meta.dirname, '../../node_modules'))]
    },
    host: '127.0.0.1',
    port: 15325,
    strictPort: true
  }
})
