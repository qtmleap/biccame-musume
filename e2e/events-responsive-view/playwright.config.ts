import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '..',
  testMatch: 'events-responsive-view.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 15000,
  use: { baseURL: 'http://127.0.0.1:15322', serviceWorkers: 'block', launchOptions: { args: ['--no-sandbox'] } },
  webServer: {
    cwd: resolve(import.meta.dirname, '../..'),
    command: 'bun vite --config e2e/events-responsive-view/vite.config.ts',
    url: 'http://127.0.0.1:15322/',
    reuseExistingServer: false,
    timeout: 60000
  }
})
