import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '..',
  testMatch: ['character-search-layout.spec.ts'],
  retries: 0,
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:15324', serviceWorkers: 'block', launchOptions: { args: ['--no-sandbox'] } },
  webServer: {
    cwd: resolve(import.meta.dirname, '../..'),
    command: 'bun vite --config e2e/character-search-layout/vite.config.ts',
    url: 'http://127.0.0.1:15324/e2e/character-search-layout/index.html',
    reuseExistingServer: false,
    timeout: 60000
  }
})
