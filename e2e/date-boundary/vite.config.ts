import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 日付境界の実コンポーネントを、Worker・外部サービスなしで検証する。
export default defineConfig({
  plugins: [react()],
  cacheDir: resolve(import.meta.dirname, '../../.cache/date-boundary/vite'),
  optimizeDeps: { entries: ['e2e/date-boundary/index.html'] },
  resolve: { alias: { '@': resolve(import.meta.dirname, '../../src') } },
  define: {
    'import.meta.env.DEV': 'false',
    __AUTH_DOMAIN__: JSON.stringify('localhost')
  },
  server: { host: '127.0.0.1', port: 15307, strictPort: true }
})
