import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 実際の操作とレスポンシブCSSを、外部サービスなしで検証する。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: resolve(import.meta.dirname, '../../.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b07/vite-cache'),
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, '../../src')
    }
  },
  define: {
    'import.meta.env.DEV': 'false',
    __AUTH_DOMAIN__: JSON.stringify('localhost')
  },
  optimizeDeps: { entries: ['e2e/card-surface-layout/index.html'] },
  server: {
    host: '127.0.0.1',
    port: 15327,
    strictPort: true,
    fs: {
      allow: [resolve(import.meta.dirname, '../..'), realpathSync(resolve(import.meta.dirname, '../../node_modules'))]
    }
  }
})
