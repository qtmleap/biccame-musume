import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '..',
  testMatch: 'event-filter-sheet-layout.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:15328', serviceWorkers: 'block', launchOptions: { args: ['--no-sandbox'] } },
  webServer: {
    cwd: resolve(import.meta.dirname, '../..'),
    command: 'bun vite --config e2e/event-filter-sheet-layout/vite.config.ts',
    url: 'http://127.0.0.1:15328/',
    reuseExistingServer: false,
    timeout: 60000
  }
})
