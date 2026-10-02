import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '..',
  testMatch: ['card-surface-layout.spec.ts'],
  retries: 0,
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:15327', serviceWorkers: 'block', launchOptions: { args: ['--no-sandbox'] } },
  webServer: {
    cwd: resolve(import.meta.dirname, '../..'),
    command: 'bun vite --config e2e/card-surface-layout/vite.config.ts',
    url: 'http://127.0.0.1:15327/e2e/card-surface-layout/index.html',
    reuseExistingServer: false,
    timeout: 60000
  }
})
