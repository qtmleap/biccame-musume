import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '..',
  testMatch: 'calendar-responsive-controls.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:15323', serviceWorkers: 'block', launchOptions: { args: ['--no-sandbox'] } },
  webServer: {
    cwd: resolve(import.meta.dirname, '../..'),
    command: 'bun vite --config e2e/calendar-responsive-controls/vite.config.ts',
    url: 'http://127.0.0.1:15323/e2e/calendar-responsive-controls/index.html',
    reuseExistingServer: false,
    timeout: 60000
  }
})
