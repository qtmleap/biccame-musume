import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import local from './local/vite.config.ts'

// Existing A01/A02 SDK-boundary mocks remain explicitly runnable, separate from real emulator integration.
export default defineConfig({
  ...local,
  cacheDir: resolve(import.meta.dirname, '../.cache/auth-fixture/vite'),
  resolve: { alias: { '@': resolve(import.meta.dirname, '../src') } },
  optimizeDeps: { entries: ['e2e/fixtures/auth-session.html', 'e2e/local/index.html'] },
  server: { ...local.server, proxy: {} }
})
