import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '..',
  testMatch: 'date-boundary.spec.ts',
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:15307',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    launchOptions: { args: ['--no-sandbox'] }
  },
  webServer: {
    cwd: resolve(import.meta.dirname, '../..'),
    command: 'bun vite --config e2e/date-boundary/vite.config.ts',
    url: 'http://127.0.0.1:15307/e2e/date-boundary/index.html',
    reuseExistingServer: false,
    timeout: 60000
  }
})
