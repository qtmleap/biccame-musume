import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '..',
  testMatch: ['event-list-state.spec.ts', 'admin-event-copy-error.spec.ts'],
  retries: 0,
  workers: 1,
  timeout: 15000,
  use: { baseURL: 'http://127.0.0.1:15308', serviceWorkers: 'block', launchOptions: { args: ['--no-sandbox'] } },
  webServer: {
    cwd: resolve(import.meta.dirname, '../..'),
    command: 'bun vite --config e2e/event-state/vite.config.ts',
    url: 'http://127.0.0.1:15308/e2e/event-state/index.html',
    reuseExistingServer: false,
    timeout: 60000
  }
})
